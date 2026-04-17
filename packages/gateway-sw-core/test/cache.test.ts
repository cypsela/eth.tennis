import { describe, expect, test, vi } from "vitest";
import { createSwrCache } from "../src/cache.js";

describe("createSwrCache", () => {
  test("returns undefined for missing keys", () => {
    const cache = createSwrCache<string, number>({ ttlMs: 1000 });
    expect(cache.get("missing")).toBeUndefined();
  });

  test("getOrLoad fetches on miss and caches", async () => {
    const loader = vi.fn().mockResolvedValue(42);
    const cache = createSwrCache<string, number>({ ttlMs: 1000 });
    const a = await cache.getOrLoad("k", loader);
    const b = await cache.getOrLoad("k", loader);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  test("expired entries trigger background refresh but return stale value", async () => {
    vi.useFakeTimers();
    let value = 1;
    const loader = vi.fn(async () => value);
    const cache = createSwrCache<string, number>({ ttlMs: 100 });

    await cache.getOrLoad("k", loader);
    vi.advanceTimersByTime(200);
    value = 2;
    const stale = await cache.getOrLoad("k", loader);
    expect(stale).toBe(1);

    await vi.runAllTimersAsync();
    const fresh = await cache.getOrLoad("k", loader);
    expect(fresh).toBe(2);
    vi.useRealTimers();
  });

  test("clear removes all entries", async () => {
    const cache = createSwrCache<string, number>({ ttlMs: 1000 });
    await cache.getOrLoad("k", async () => 1);
    cache.clear();
    expect(cache.get("k")).toBeUndefined();
  });
});
