import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { installContentSw } from "../src/absorber/install.js";
import { _resetLogOnceForTests } from "../src/log-once.js";
import { makeMockFetchEvent, makeMockScope } from "./helpers/mock-sw-scope.js";

describe("absorb composed flow", () => {
  beforeEach(() => _resetLogOnceForTests());
  afterEach(() => vi.restoreAllMocks());

  test("absorb message → eval → install → activate → flags + dispatcher routing", async () => {
    const { scope, listeners } = makeMockScope();
    const writeSwState = vi.fn(async () => undefined);
    const fetchSwScript = vi.fn(async () => new Uint8Array([1]));
    const defaultFetch = vi.fn(async () => new Response("default"));
    const installCallback = vi.fn();
    const activateCallback = vi.fn();
    const fetchCallback = vi.fn((e: FetchEvent) =>
      e.respondWith(
        new Response("absorbed", { headers: { "x-absorbed": "1" } }),
      )
    );

    installContentSw({
      scope,
      readSwState: () => null,
      writeSwState,
      fetchSwScript,
      sameOriginFetch: vi.fn(async () => new Response()),
      defaultFetch,
      importModule: async (
        _bytes: Uint8Array,
        _self: ServiceWorkerGlobalScope,
        _fetch: typeof globalThis.fetch,
      ) => {
        scope.addEventListener("install", installCallback);
        scope.addEventListener("activate", activateCallback);
        scope.addEventListener("fetch", fetchCallback);
      },
    });

    const message = listeners.find((l) => l.type === "message");
    expect(message).toBeDefined();

    const channel = new MessageChannel();
    const replies: unknown[] = [];
    channel.port1.onmessage = (e) => replies.push(e.data);
    const messageEvent = {
      data: { type: "absorb", swUrl: "/sw.js" },
      ports: [channel.port2],
      waitUntil: (p: Promise<unknown>) => p,
    } as unknown as ExtendableMessageEvent;
    await (message?.fn as Function)(messageEvent);

    await new Promise((r) => setTimeout(r, 10));

    expect(installCallback).toHaveBeenCalledTimes(1);
    expect(activateCallback).toHaveBeenCalledTimes(1);
    expect(writeSwState).toHaveBeenCalledWith({
      swUrl: "/sw.js",
      swInstalled: true,
      swActivated: true,
    });
    expect(replies[0]).toMatchObject({ type: "absorb-ack", swUrl: "/sw.js" });

    const fetchListener = listeners.find((l) => l.type === "fetch");
    expect(fetchListener).toBeDefined();
    const ev = makeMockFetchEvent(new Request("https://x.eth.tennis/page"));
    (fetchListener?.fn as (e: FetchEvent) => void)(ev);
    expect(fetchCallback).toHaveBeenCalled();
    expect(defaultFetch).not.toHaveBeenCalled();
  });

  test("eval failure → absorb-fail reply, dispatcher stays empty", async () => {
    const { scope, listeners } = makeMockScope();
    installContentSw({
      scope,
      readSwState: () => null,
      writeSwState: vi.fn(),
      fetchSwScript: async () => new Uint8Array([1]),
      sameOriginFetch: vi.fn(async () => new Response()),
      defaultFetch: async () => new Response("default"),
      importModule: async (
        _bytes: Uint8Array,
        _self: ServiceWorkerGlobalScope,
        _fetch: typeof globalThis.fetch,
      ) => {
        throw new Error("eval-boom");
      },
    });
    const message = listeners.find((l) => l.type === "message");
    const channel = new MessageChannel();
    const replies: unknown[] = [];
    channel.port1.onmessage = (e) => replies.push(e.data);
    await (message?.fn as Function)({
      data: { type: "absorb", swUrl: "/sw.js" },
      ports: [channel.port2],
      waitUntil: (p: Promise<unknown>) => p,
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(replies[0]).toMatchObject({
      type: "absorb-fail",
      swUrl: "/sw.js",
      reason: "eval-failed",
    });
  });

  test("falls through to defaultFetch when no absorbed listener responds", async () => {
    const { scope, listeners } = makeMockScope();
    const defaultFetch = vi.fn(async () => new Response("from-gateway"));
    installContentSw({
      scope,
      readSwState: () => null,
      writeSwState: vi.fn(),
      fetchSwScript: async () => new Uint8Array(),
      sameOriginFetch: vi.fn(async () => new Response()),
      defaultFetch,
      importModule: async (
        _bytes: Uint8Array,
        _self: ServiceWorkerGlobalScope,
        _fetch: typeof globalThis.fetch,
      ) => {},
    });
    const fetchListener = listeners.find((l) => l.type === "fetch");
    const ev = makeMockFetchEvent(new Request("https://x.eth.tennis/page"));
    (fetchListener?.fn as (e: FetchEvent) => void)(ev);
    expect(defaultFetch).toHaveBeenCalled();
  });

  test("absorbed listener routes same-origin fetch through sameOriginFetch and cross-origin through realFetch", async () => {
    const { scope, listeners } = makeMockScope();
    const sameOriginResponse = new Response("from-gateway");
    const sameOriginFetch = vi.fn(async () => sameOriginResponse);
    // mock-sw-scope sets scope.fetch = vi.fn(async () => new Response("real fetch")).
    // installContentSw captures realFetch = scope.fetch.bind(scope), so calls to
    // realFetch increment scope.fetch's call count.
    const realFetchMock = scope.fetch as unknown as ReturnType<typeof vi.fn>;
    realFetchMock.mockClear();

    installContentSw({
      scope,
      readSwState: () => null,
      writeSwState: vi.fn(),
      fetchSwScript: async () => new Uint8Array([1]),
      sameOriginFetch,
      defaultFetch: async () => new Response("default"),
      importModule: async (
        _b: Uint8Array,
        self: ServiceWorkerGlobalScope,
        fetch: typeof globalThis.fetch,
      ) => {
        self.addEventListener("fetch", (e) => {
          e.respondWith((async () => fetch(e.request))());
        });
      },
    });

    // Trigger absorb so the captured listener is registered with the dispatcher.
    const message = listeners.find((l) => l.type === "message");
    const channel = new MessageChannel();
    await (message?.fn as Function)({
      data: { type: "absorb", swUrl: "/sw.js" },
      ports: [channel.port2],
      waitUntil: (p: Promise<unknown>) => p,
    });
    await new Promise((r) => setTimeout(r, 10));

    // Now drive same-origin and cross-origin fetch events through the gateway listener.
    const fetchListener = listeners.find((l) => l.type === "fetch");

    const sameOrigin = makeMockFetchEvent(
      new Request("https://x.eth.tennis/api"),
    );
    (fetchListener?.fn as (e: FetchEvent) => void)(sameOrigin);
    await sameOrigin.responded();
    expect(sameOriginFetch).toHaveBeenCalledTimes(1);
    expect(realFetchMock).not.toHaveBeenCalled();

    const crossOrigin = makeMockFetchEvent(
      new Request("https://other.example/x"),
    );
    (fetchListener?.fn as (e: FetchEvent) => void)(crossOrigin);
    await crossOrigin.responded();
    expect(realFetchMock).toHaveBeenCalledTimes(1);
  });
});
