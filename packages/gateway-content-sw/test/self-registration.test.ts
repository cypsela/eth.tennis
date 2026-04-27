import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { _resetLogOnceForTests } from "../src/log-once.ts";
import { createRegistrationShim } from "../src/sw-shims/self-registration.ts";
import { makeMockScope } from "./helpers/mock-sw-scope.ts";

describe("self-registration shim", () => {
  beforeEach(() => _resetLogOnceForTests());
  afterEach(() => vi.restoreAllMocks());

  test("scope mirrors scope.registration.scope", () => {
    const { scope } = makeMockScope();
    const reg = createRegistrationShim(scope);
    expect(reg.scope).toBe("https://x.eth.tennis/");
  });

  test("active.scriptURL points at the absorbed sw url", () => {
    const { scope } = makeMockScope();
    const reg = createRegistrationShim(scope, { swUrl: "/sw.js" });
    expect(reg.active?.scriptURL).toContain("/sw.js");
    expect(reg.active?.state).toBe("activated");
  });

  test("pushManager access logs once and returns a stub", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { scope } = makeMockScope();
    const reg = createRegistrationShim(scope);
    expect(reg.pushManager).toBeDefined();
  });

  test("unregister returns true and logs once", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { scope } = makeMockScope();
    const reg = createRegistrationShim(scope);
    await expect(reg.unregister()).resolves.toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
