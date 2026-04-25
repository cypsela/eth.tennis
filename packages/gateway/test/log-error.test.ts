import { describe, expect, test, vi } from "vitest";

import { logErrorTree } from "../src/log-error.ts";

describe("logErrorTree", () => {
  test("logs label + err once when cause is not AggregateError", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("inner");
    const err = Object.assign(new Error("outer"), { cause });
    logErrorTree("[label]", err);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("[label]", err);
    spy.mockRestore();
  });

  test("logs label + err once when no cause is attached", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("solo");
    logErrorTree("[label]", err);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("[label]", err);
    spy.mockRestore();
  });

  test("expands AggregateError cause: one extra line per inner error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const inner1 = new Error("rpc 1 failed");
    const inner2 = new Error("rpc 2 failed");
    const cause = new AggregateError([inner1, inner2], "all rejected");
    const err = Object.assign(new Error("wrap"), { cause });
    logErrorTree("[label]", err);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy).toHaveBeenNthCalledWith(1, "[label]", err);
    expect(spy).toHaveBeenNthCalledWith(2, "[label] [rpc 0]", inner1);
    expect(spy).toHaveBeenNthCalledWith(3, "[label] [rpc 1]", inner2);
    spy.mockRestore();
  });
});
