import { describe, expect, test } from "vitest";
import { detectMode } from "../src/bootstrap.ts";

describe("detectMode", () => {
  test("returns sw-unsupported when serviceWorker not in navigator", () => {
    const nav = {} as Navigator;
    expect(detectMode(nav)).toBe("sw-unsupported");
  });

  test("returns cold-start otherwise", () => {
    const nav = { serviceWorker: {} } as Navigator;
    expect(detectMode(nav)).toBe("cold-start");
  });
});
