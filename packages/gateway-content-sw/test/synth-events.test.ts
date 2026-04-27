import { describe, expect, test } from "vitest";
import { fireActivate, fireInstall } from "../src/absorber/synth-events.js";

describe("synth-events", () => {
  test("fireInstall awaits every waitUntil promise", async () => {
    let resolved = 0;
    const listener = (e: ExtendableEvent) => {
      e.waitUntil(
        new Promise<void>((r) =>
          setTimeout(() => {
            resolved += 1;
            r();
          }, 5)
        ),
      );
    };
    await fireInstall([listener, listener]);
    expect(resolved).toBe(2);
  });

  test("fireInstall rejects if any waitUntil promise rejects", async () => {
    const listener = (e: ExtendableEvent) => {
      e.waitUntil(Promise.reject(new Error("nope")));
    };
    await expect(fireInstall([listener])).rejects.toThrow(/nope/);
  });

  test("synchronous throw in listener rejects the fire", async () => {
    const listener = () => {
      throw new Error("sync");
    };
    await expect(fireInstall([listener])).rejects.toThrow(/sync/);
  });

  test("fireActivate works the same way", async () => {
    const order: string[] = [];
    const listener = (e: ExtendableEvent) => {
      e.waitUntil(Promise.resolve().then(() => order.push("done")));
    };
    await fireActivate([listener]);
    expect(order).toEqual(["done"]);
  });

  test("fireInstall with empty listener list resolves immediately", async () => {
    await expect(fireInstall([])).resolves.toBeUndefined();
  });
});
