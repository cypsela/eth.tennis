import { describe, expect, test } from "vitest";
import { formatHop, formatLine, formatRef, makeLogger } from "../src/log.js";

describe("formatLine", () => {
  test("pads source column to width 10, formats timestamp to 3dp", () => {
    const line = formatLine({
      t: 0.287,
      source: "sw",
      glyph: "✓",
      text: "contenthash: ipfs://bafy…xyz",
    });
    expect(line).toBe("[0.287] [sw]        ✓ contenthash: ipfs://bafy…xyz");
  });

  test("pads bootstrap source the same width", () => {
    const line = formatLine({
      t: 0.000,
      source: "bootstrap",
      glyph: ">",
      text: "starting",
    });
    expect(line).toBe("[0.000] [bootstrap] > starting");
  });

  test("omits glyph spacer when glyph is undefined", () => {
    const line = formatLine({ t: 1, source: "sw", text: "plain" });
    expect(line).toBe("[1.000] [sw]          plain");
  });
});

describe("makeLogger", () => {
  test("logger emits entries with correct source + monotonic time", () => {
    const t0 = 1000;
    const entries: unknown[] = [];
    const logger = makeLogger({
      source: "bootstrap",
      startedAt: t0,
      now: (() => {
        let n = 0;
        return () => t0 + n++ * 100;
      })(),
      sink: (e) => entries.push(e),
    });

    logger.info("hello");
    logger.success("done", "✓");
    expect(entries).toEqual([{
      t: 0,
      source: "bootstrap",
      level: "info",
      text: "hello",
    }, {
      t: 0.1,
      source: "bootstrap",
      level: "success",
      text: "done",
      glyph: "✓",
    }]);
  });
});

describe("formatRef / formatHop", () => {
  test("formatRef renders '<protocol>://<value>'", () => {
    expect(formatRef({ kind: "address", protocol: "ens", value: "x.eth" }))
      .toBe("ens://x.eth");
    expect(formatRef({ kind: "content", protocol: "ipfs", value: "bafy" }))
      .toBe("ipfs://bafy");
  });

  test("formatHop joins two refs with '→'", () => {
    const a = { kind: "address" as const, protocol: "ens", value: "x.eth" };
    const b = { kind: "content" as const, protocol: "ipfs", value: "bafy" };
    expect(formatHop(a, b)).toBe("ens://x.eth → ipfs://bafy");
  });
});
