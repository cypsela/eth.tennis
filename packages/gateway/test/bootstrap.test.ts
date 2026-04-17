import { describe, expect, test } from "vitest";
import { detectMode } from "../src/bootstrap.ts";

describe("detectMode", () => {
  test("returns content-error when window.__GATEWAY_STATE__ has error", () => {
    (globalThis as any).window = {
      __GATEWAY_STATE__: {
        error: "no-contenthash",
        ensName: "x.eth",
        timestamp: 1,
      },
    };
    expect(detectMode(window as any)).toBe("content-error");
  });

  test("returns sw-unsupported when serviceWorker not in navigator", () => {
    (globalThis as any).window = {};
    const nav = {} as Navigator;
    expect(detectMode(window as any, nav)).toBe("sw-unsupported");
  });

  test("returns cold-start otherwise", () => {
    (globalThis as any).window = {};
    const nav = { serviceWorker: {} } as Navigator;
    expect(detectMode(window as any, nav)).toBe("cold-start");
  });
});
