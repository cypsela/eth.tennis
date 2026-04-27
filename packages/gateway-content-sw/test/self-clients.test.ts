import { describe, expect, test } from "vitest";
import { createClientsShim } from "../src/sw-shims/self-clients.ts";
import { makeMockScope } from "./helpers/mock-sw-scope.ts";

describe("self-clients shim", () => {
  test("matchAll passes through to scope.clients", async () => {
    const { scope, matchAllResult } = makeMockScope();
    matchAllResult.push({ id: "c1" } as Client);
    const shim = createClientsShim(scope);
    const result = await shim.matchAll({ type: "window" });
    expect(result).toEqual([{ id: "c1" }]);
  });

  test("claim is a no-op (does not call scope.clients.claim)", async () => {
    const { scope } = makeMockScope();
    const shim = createClientsShim(scope);
    await expect(shim.claim()).resolves.toBeUndefined();
    expect((scope.clients as any).claim).not.toHaveBeenCalled();
  });

  test("get passes through to scope.clients", async () => {
    const { scope } = makeMockScope();
    const shim = createClientsShim(scope);
    await shim.get("anyId");
    expect((scope.clients as any).get).toHaveBeenCalledWith("anyId");
  });
});
