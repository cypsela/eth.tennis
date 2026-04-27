import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { _resetLogOnceForTests } from "../src/log-once.ts";
import { makeStubProxy } from "../src/sw-shims/stub-proxy.ts";

describe("makeStubProxy", () => {
  beforeEach(() => _resetLogOnceForTests());
  afterEach(() => vi.restoreAllMocks());

  test("logs once on first property read", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stub = makeStubProxy("pushManager");
    void (stub as any).getSubscription;
    void (stub as any).getSubscription;
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toMatch(/pushManager.getSubscription/);
  });

  test("calling a function on the stub returns a resolved promise", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const stub = makeStubProxy("pushManager");
    await expect((stub as any).getSubscription()).resolves.toBeUndefined();
  });

  test("nested access keeps producing stubs", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const stub = makeStubProxy("registration");
    expect(typeof (stub as any).pushManager.subscribe).toBe("function");
  });
});
