import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { _resetLogOnceForTests, logOnce } from "../src/log-once.ts";

describe("logOnce", () => {
  beforeEach(() => _resetLogOnceForTests());
  afterEach(() => vi.restoreAllMocks());

  test("logs the first time a key is seen", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logOnce("a");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("suppresses repeats of the same key", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logOnce("dup");
    logOnce("dup");
    logOnce("dup");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("includes the err argument in the log call", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = new Error("boom");
    logOnce("k", err);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("k"), err);
  });
});
