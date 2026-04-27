import { describe, expect, test, vi } from "vitest";
import { createDispatcher } from "../src/absorber/dispatcher.js";
import { rehydrate } from "../src/absorber/rehydrate.js";
import { makeMockFetchEvent, makeMockScope } from "./helpers/mock-sw-scope.js";

describe("rehydrate", () => {
  test("re-evaluates module and attaches listeners; no install/activate fired", async () => {
    const { scope } = makeMockScope();
    const dispatcher = createDispatcher();
    const installSpy = vi.fn();
    const fetchSpy = vi.fn((e: FetchEvent) =>
      e.respondWith(new Response("rehydrated"))
    );
    const fetchSwScript = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const importModule = async (_url: string) => {
      scope.addEventListener("install", installSpy);
      scope.addEventListener("fetch", fetchSpy);
    };
    await rehydrate({
      scope,
      dispatcher,
      swUrl: "/sw.js",
      fetchSwScript,
      importModule,
    });
    expect(installSpy).not.toHaveBeenCalled();
    const ev = makeMockFetchEvent(new Request("https://x/"));
    expect(dispatcher.handle(ev)).toBe(true);
    expect(fetchSpy).toHaveBeenCalled();
  });

  test("if fetchSwScript fails, dispatcher stays empty (L1 fallback)", async () => {
    const { scope } = makeMockScope();
    const dispatcher = createDispatcher();
    const fetchSwScript = vi.fn(async () => {
      throw new Error("nope");
    });
    await rehydrate({
      scope,
      dispatcher,
      swUrl: "/sw.js",
      fetchSwScript,
      importModule: async () => {},
    });
    const ev = makeMockFetchEvent(new Request("https://x/"));
    expect(dispatcher.handle(ev)).toBe(false);
  });
});
