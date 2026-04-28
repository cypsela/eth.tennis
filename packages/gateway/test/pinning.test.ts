import { CID } from "multiformats/cid";
import { describe, expect, test, vi } from "vitest";
import { createEnsurePinned, fetchRootThenDrain } from "../src/pinning.ts";

const SAMPLE_CID = CID.parse(
  "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
);

function fakeIter(yields: number, throwAfter?: number): AsyncGenerator<CID> {
  let i = 0;
  const gen: AsyncGenerator<CID> = {
    next: async () => {
      if (throwAfter !== undefined && i === throwAfter) {
        throw new Error("drain-fail");
      }
      if (i < yields) {
        i++;
        return { value: SAMPLE_CID, done: false };
      }
      return { value: undefined as unknown as CID, done: true };
    },
    return: async () => ({ value: undefined as unknown as CID, done: true }),
    throw: async (e: unknown) => {
      throw e;
    },
    [Symbol.asyncIterator]() {
      return gen;
    },
    [Symbol.asyncDispose]: async () => {},
  };
  return gen;
}

describe("fetchRootThenDrain", () => {
  test("returns after first yield; drains the rest in the background", async () => {
    const iter = fakeIter(5);
    const helia = { pins: { add: vi.fn(() => iter) } } as any;
    const onSuccess = vi.fn();
    await fetchRootThenDrain(helia, SAMPLE_CID, { onSuccess });
    expect(helia.pins.add).toHaveBeenCalledWith(SAMPLE_CID);
    await new Promise((r) => setTimeout(r, 0));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test("AlreadyPinnedError at root triggers onSuccess immediately", async () => {
    const err = new Error("already pinned");
    err.name = "AlreadyPinnedError";
    const iter = {
      next: async () => {
        throw err;
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    } as any;
    const helia = { pins: { add: vi.fn(() => iter) } } as any;
    const onSuccess = vi.fn();
    const onFailure = vi.fn();
    await fetchRootThenDrain(helia, SAMPLE_CID, { onSuccess, onFailure });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
  });

  test("root-fetch errors other than AlreadyPinnedError re-throw", async () => {
    const iter = {
      next: async () => {
        throw new Error("offline");
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    } as any;
    const helia = { pins: { add: vi.fn(() => iter) } } as any;
    await expect(fetchRootThenDrain(helia, SAMPLE_CID)).rejects.toThrow(
      "offline",
    );
  });

  test("drain errors call onFailure, not onSuccess", async () => {
    const iter = fakeIter(3, 2);
    const helia = { pins: { add: vi.fn(() => iter) } } as any;
    const onSuccess = vi.fn();
    const onFailure = vi.fn();
    await fetchRootThenDrain(helia, SAMPLE_CID, { onSuccess, onFailure });
    await new Promise((r) => setTimeout(r, 0));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledTimes(1);
  });
});

describe("createEnsurePinned", () => {
  test("dedups concurrent calls for the same CID", async () => {
    const helia = { pins: { add: vi.fn(() => fakeIter(3)) } } as any;
    const ensurePinned = createEnsurePinned(helia);
    await Promise.all([
      ensurePinned(SAMPLE_CID),
      ensurePinned(SAMPLE_CID),
      ensurePinned(SAMPLE_CID),
    ]);
    expect(helia.pins.add).toHaveBeenCalledTimes(1);
  });

  test("after completion, repeat call resolves immediately and fires onSuccess", async () => {
    const helia = { pins: { add: vi.fn(() => fakeIter(2)) } } as any;
    const ensurePinned = createEnsurePinned(helia);
    await ensurePinned(SAMPLE_CID);
    await new Promise((r) => setTimeout(r, 0));
    const onSuccess = vi.fn();
    await ensurePinned(SAMPLE_CID, { onSuccess });
    expect(helia.pins.add).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test("per-call hooks fire on drain completion for all concurrent callers", async () => {
    const helia = { pins: { add: vi.fn(() => fakeIter(3)) } } as any;
    const ensurePinned = createEnsurePinned(helia);
    const onSuccess1 = vi.fn();
    const onSuccess2 = vi.fn();
    await Promise.all([
      ensurePinned(SAMPLE_CID, { onSuccess: onSuccess1 }),
      ensurePinned(SAMPLE_CID, { onSuccess: onSuccess2 }),
    ]);
    await new Promise((r) => setTimeout(r, 0));
    expect(onSuccess1).toHaveBeenCalledTimes(1);
    expect(onSuccess2).toHaveBeenCalledTimes(1);
  });

  test("drain failure fires onFailure for all callers; subsequent call retries", async () => {
    const failIter = fakeIter(3, 1);
    const successIter = fakeIter(2);
    const helia = {
      pins: {
        add: vi
          .fn()
          .mockReturnValueOnce(failIter)
          .mockReturnValueOnce(successIter),
      },
    } as any;
    const ensurePinned = createEnsurePinned(helia);
    const onFailure = vi.fn();
    await ensurePinned(SAMPLE_CID, { onFailure });
    await new Promise((r) => setTimeout(r, 0));
    expect(onFailure).toHaveBeenCalledTimes(1);
    await ensurePinned(SAMPLE_CID);
    expect(helia.pins.add).toHaveBeenCalledTimes(2);
  });

  test("root-fetch error propagates; subsequent call retries", async () => {
    const failIter = {
      next: async () => {
        throw new Error("offline");
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    } as any;
    const successIter = fakeIter(2);
    const helia = {
      pins: {
        add: vi
          .fn()
          .mockReturnValueOnce(failIter)
          .mockReturnValueOnce(successIter),
      },
    } as any;
    const ensurePinned = createEnsurePinned(helia);
    await expect(ensurePinned(SAMPLE_CID)).rejects.toThrow("offline");
    await ensurePinned(SAMPLE_CID);
    expect(helia.pins.add).toHaveBeenCalledTimes(2);
  });
});
