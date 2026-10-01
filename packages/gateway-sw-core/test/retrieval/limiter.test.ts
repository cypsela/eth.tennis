import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createGatewayLimiter } from "../../src/retrieval/limiter.js";

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("createGatewayLimiter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("runs at most maxConcurrent tasks at once", async () => {
    const limiter = createGatewayLimiter({ maxConcurrent: 2 });
    const gates = [deferred(), deferred(), deferred()];
    const started: number[] = [];
    const runs = gates.map((g, i) =>
      limiter.run(async () => {
        started.push(i);
        await g.promise;
        return i;
      })
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([0, 1]);
    expect(limiter.hasCapacity()).toBe(false);

    gates[0]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([0, 1, 2]);

    gates[1]!.resolve();
    gates[2]!.resolve();
    expect(await Promise.all(runs)).toEqual([0, 1, 2]);
    expect(limiter.hasCapacity()).toBe(true);
  });

  test("a failing task frees its slot", async () => {
    const limiter = createGatewayLimiter({ maxConcurrent: 1 });
    await expect(limiter.run(async () => {
      throw new Error("boom");
    }))
      .rejects
      .toThrow("boom");
    expect(await limiter.run(async () => "next")).toBe("next");
  });

  test("allows a burst, then refills at perSecond", async () => {
    const limiter = createGatewayLimiter({
      maxConcurrent: 10,
      burst: 2,
      perSecond: 2,
    });
    const started: number[] = [];
    for (let i = 0; i < 4; i++) {
      void limiter.run(async () => {
        started.push(i);
      });
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([0, 1]);
    expect(limiter.hasCapacity()).toBe(false);

    await vi.advanceTimersByTimeAsync(500);
    expect(started).toEqual([0, 1, 2]);
    await vi.advanceTimersByTimeAsync(500);
    expect(started).toEqual([0, 1, 2, 3]);
  });

  test("an idle limiter refills up to burst and no further", async () => {
    const limiter = createGatewayLimiter({
      maxConcurrent: 10,
      burst: 2,
      perSecond: 1,
    });
    await limiter.run(async () => {});
    await limiter.run(async () => {});
    await vi.advanceTimersByTimeAsync(60_000);
    const started: number[] = [];
    for (let i = 0; i < 3; i++) {
      void limiter.run(async () => {
        started.push(i);
      });
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([0, 1]);
  });

  test("an aborted waiter leaves the queue without running", async () => {
    const limiter = createGatewayLimiter({ maxConcurrent: 1 });
    const gate = deferred();
    const first = limiter.run(() => gate.promise);
    const controller = new AbortController();
    const fn = vi.fn(async () => {});
    const waiting = limiter.run(fn, controller.signal);
    controller.abort();
    await expect(waiting).rejects.toThrow();
    gate.resolve();
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).not.toHaveBeenCalled();
    expect(limiter.hasCapacity()).toBe(true);
  });
});
