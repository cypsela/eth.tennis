import { describe, expect, test } from "vitest";
import {
  type AbsorbAck,
  type AbsorbFail,
  type AbsorbRequest,
  isAbsorbAck,
  isAbsorbFail,
  isAbsorbRequest,
} from "../src/protocol/messages.ts";

describe("protocol/messages", () => {
  test("isAbsorbRequest narrows on the discriminant", () => {
    const m: unknown = { type: "absorb", swUrl: "/sw.js" };
    expect(isAbsorbRequest(m)).toBe(true);
    if (isAbsorbRequest(m)) {
      const r: AbsorbRequest = m;
      expect(r.swUrl).toBe("/sw.js");
    }
  });

  test("rejects non-objects, missing fields, or wrong type tag", () => {
    expect(isAbsorbRequest(null)).toBe(false);
    expect(isAbsorbRequest({ type: "absorb" })).toBe(false);
    expect(isAbsorbRequest({ type: "other", swUrl: "/sw.js" })).toBe(false);
  });

  test("isAbsorbAck and isAbsorbFail recognize their shapes", () => {
    const ack: AbsorbAck = { type: "absorb-ack", swUrl: "/sw.js" };
    expect(isAbsorbAck(ack)).toBe(true);
    const fail: AbsorbFail = {
      type: "absorb-fail",
      swUrl: "/sw.js",
      reason: "fetch-failed",
    };
    expect(isAbsorbFail(fail)).toBe(true);
  });
});
