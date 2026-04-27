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

  test("passes bytes, self, and fetch shim to importModule", async () => {
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
    expect(fakeImport.mock.calls[0]![1]).toBe(scope);
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

  test("default eval: bare fetch in absorbed module resolves to shim", async () => {
    const { scope } = makeMockScope();
    const shim = vi.fn(async () => new Response("from-shim"));
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
