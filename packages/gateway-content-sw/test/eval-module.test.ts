import { describe, expect, test, vi } from "vitest";
import { evaluateSwModule } from "../src/absorber/eval-module.js";
import { makeMockScope } from "./helpers/mock-sw-scope.js";

describe("evaluateSwModule", () => {
  test("captures fetch listener registered during eval", async () => {
    const { scope } = makeMockScope();
    const fakeImport = vi.fn(async () => {
      scope.addEventListener("fetch", (e) => e.respondWith(new Response("ok")));
    });
    const captured = await evaluateSwModule({
      bytes: new Uint8Array([1, 2, 3]),
      scope,
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
        importModule: async () => {
          throw new Error("eval-boom");
        },
      }),
    )
      .rejects
      .toThrow(/eval-boom/);
  });

  test("passes bytes and scope to importModule", async () => {
    const { scope } = makeMockScope();
    const fakeImport = vi.fn(
      async (_b: Uint8Array, _s: ServiceWorkerGlobalScope) => {/* nothing */},
    );
    const bytes = new TextEncoder().encode("self.x = 1;");
    await evaluateSwModule({ bytes, scope, importModule: fakeImport });
    expect(fakeImport.mock.calls[0]![0]).toBe(bytes);
    expect(fakeImport.mock.calls[0]![1]).toBe(scope);
  });

  test("default eval runs the SW source as a classic script", async () => {
    const { scope } = makeMockScope();
    const bytes = new TextEncoder().encode(
      `self.addEventListener('fetch', () => {});`,
    );
    const captured = await evaluateSwModule({ bytes, scope });
    expect(captured.fetch.length).toBe(1);
  });
});
