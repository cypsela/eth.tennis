import { describe, expect, test, vi } from "vitest";
import { evaluateSwModule } from "../src/absorber/eval-module.js";
import { makeMockFetchEvent, makeMockScope } from "./helpers/mock-sw-scope.js";

describe("evaluateSwModule", () => {
  test("captures fetch listener registered during eval", async () => {
    const { scope } = makeMockScope();
    const fakeImport = vi.fn(async () => {
      scope.addEventListener("fetch", (e) => e.respondWith(new Response("ok")));
    });
    const captured = await evaluateSwModule({
      bytes: new Uint8Array([1, 2, 3]),
      scope,
      shim: scope.fetch,
      importModule: fakeImport,
    });
    expect(captured.fetch.length).toBe(1);
    expect(captured.install.length).toBe(0);
  });

  test("captures install + activate listeners", async () => {
    const { scope } = makeMockScope();
    const fakeImport = async () => {
      scope.addEventListener("install", () => {});
      scope.addEventListener("activate", () => {});
    };
    const captured = await evaluateSwModule({
      bytes: new Uint8Array(),
      scope,
      shim: scope.fetch,
      importModule: fakeImport,
    });
    expect(captured.install.length).toBe(1);
    expect(captured.activate.length).toBe(1);
  });

  test("addEventListener restored after eval", async () => {
    const { scope, listeners } = makeMockScope();
    const before = scope.addEventListener;
    await evaluateSwModule({
      bytes: new Uint8Array(),
      scope,
      shim: scope.fetch,
      importModule: async () => {/* nothing */},
    });
    expect(scope.addEventListener).toBe(before);
    expect(listeners.length).toBe(0);
  });

  test("module-level throw rejects", async () => {
    const { scope } = makeMockScope();
    await expect(
      evaluateSwModule({
        bytes: new Uint8Array(),
        scope,
        shim: scope.fetch,
        importModule: async () => {
          throw new Error("eval-boom");
        },
      }),
    )
      .rejects
      .toThrow(/eval-boom/);
  });

  test("passes bytes, self (Proxy), and fetch shim to importModule", async () => {
    const { scope } = makeMockScope();
    const shim = vi.fn(async () =>
      new Response()
    ) as unknown as typeof globalThis.fetch;
    const fakeImport = vi.fn(
      async (
        _b: Uint8Array,
        _s: ServiceWorkerGlobalScope,
        _f: typeof globalThis.fetch,
      ) => {/* nothing */},
    );
    const bytes = new TextEncoder().encode("self.x = 1;");
    await evaluateSwModule({ bytes, scope, shim, importModule: fakeImport });
    expect(fakeImport.mock.calls[0]![0]).toBe(bytes);
    // self is a Proxy over scope, not scope itself, but property reads are transparent:
    expect(fakeImport.mock.calls[0]![1]).not.toBe(scope);
    expect(fakeImport.mock.calls[0]![1].location).toBe(scope.location);
    expect(fakeImport.mock.calls[0]![2]).toBe(shim);
  });

  test("default eval runs the SW source as a classic script", async () => {
    const { scope } = makeMockScope();
    const bytes = new TextEncoder().encode(
      `self.addEventListener('fetch', () => {});`,
    );
    const captured = await evaluateSwModule({
      bytes,
      scope,
      shim: scope.fetch,
    });
    expect(captured.fetch.length).toBe(1);
  });

  test("Proxy: native methods bound to scope (this === scope)", async () => {
    const { scope } = makeMockScope();
    let receivedThis: unknown;
    const skipSpy = vi.fn(async function(this: unknown) {
      receivedThis = this;
    });
    (scope as unknown as { skipWaiting: typeof skipSpy; }).skipWaiting =
      skipSpy;
    const importModule = async (
      _bytes: Uint8Array,
      self: ServiceWorkerGlobalScope,
      _fetch: typeof globalThis.fetch,
    ) => {
      await self.skipWaiting();
    };
    await evaluateSwModule({
      bytes: new Uint8Array(),
      scope,
      shim: scope.fetch,
      importModule,
    });
    expect(skipSpy).toHaveBeenCalledTimes(1);
    expect(receivedThis).toBe(scope);
  });

  test("Proxy: assigning to self.fetch is silently ignored; subsequent reads still return shim", async () => {
    const { scope } = makeMockScope();
    const shim = vi.fn(async () => new Response("from-shim"));
    const customFetch = vi.fn(async () => new Response("custom"));
    const realScopeFetchBefore = scope.fetch;
    let resolvedAfterAssign: typeof globalThis.fetch | null = null;
    const importModule = async (
      _bytes: Uint8Array,
      self: ServiceWorkerGlobalScope,
      _fetch: typeof globalThis.fetch,
    ) => {
      self.fetch = customFetch as unknown as typeof globalThis.fetch;
      resolvedAfterAssign = self.fetch;
    };
    await evaluateSwModule({
      bytes: new Uint8Array(),
      scope,
      shim: shim as unknown as typeof globalThis.fetch,
      importModule,
    });
    expect(resolvedAfterAssign).toBe(shim);
    expect(scope.fetch).toBe(realScopeFetchBefore);
    expect(scope.fetch).not.toBe(customFetch);
  });

  test("Proxy: self.addEventListener still captures listeners via patched scope", async () => {
    const { scope } = makeMockScope();
    const importModule = async (
      _bytes: Uint8Array,
      self: ServiceWorkerGlobalScope,
      _fetch: typeof globalThis.fetch,
    ) => {
      self.addEventListener("fetch", (e) => e.respondWith(new Response("ok")));
    };
    const captured = await evaluateSwModule({
      bytes: new Uint8Array(),
      scope,
      shim: scope.fetch,
      importModule,
    });
    expect(captured.fetch.length).toBe(1);
  });

  test("self.fetch via Proxy reaches shim", async () => {
    const { scope } = makeMockScope();
    const shim = vi.fn(async () => new Response("from-shim"));
    let captured: typeof globalThis.fetch | null = null;
    const importModule = async (
      _bytes: Uint8Array,
      self: ServiceWorkerGlobalScope,
      _fetch: typeof globalThis.fetch,
    ) => {
      captured = self.fetch;
    };
    await evaluateSwModule({
      bytes: new Uint8Array(),
      scope,
      shim: shim as unknown as typeof globalThis.fetch,
      importModule,
    });
    expect(captured).toBe(shim);
  });

  test("default eval: bare fetch in absorbed module resolves to shim", async () => {
    const { scope } = makeMockScope();
    const shim = vi.fn(async (_req: RequestInfo | URL) =>
      new Response("from-shim")
    );
    const bytes = new TextEncoder().encode(
      `self.addEventListener('fetch', (e) => {
      e.respondWith((async () => fetch(e.request))());
    });`,
    );
    const captured = await evaluateSwModule({ bytes, scope, shim });
    const ev = makeMockFetchEvent(new Request("https://x.eth.tennis/api"));
    captured.fetch[0]!(ev);
    await ev.responded();
    expect(shim).toHaveBeenCalledTimes(1);
    const calledWith = shim.mock.calls[0]![0] as Request;
    expect(calledWith.url).toBe("https://x.eth.tennis/api");
  });
});
