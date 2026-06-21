import { describe, expect, test } from "vitest";
import { fitFontSize } from "../src/fit.ts";

describe("fitFontSize", () => {
  test("caps at 14px on wide viewports", () => {
    expect(fitFontSize(1920, 95)).toBe(14);
  });
  test("shrinks below the cap on a phone", () => {
    const px = fitFontSize(360, 95);
    expect(px).toBeLessThan(14);
    expect(px).toBeGreaterThan(4);
  });
  test("floors at 1px (never 0 or negative)", () => {
    expect(fitFontSize(0, 95)).toBe(1);
  });
});
