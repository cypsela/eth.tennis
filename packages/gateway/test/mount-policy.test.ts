import { createSiteMountStore } from "@cypsela/gateway-sw-core";
import { MemoryDatastore } from "datastore-core";
import { describe, expect, test, vi } from "vitest";
import { createMountPolicy } from "../src/mount-policy.ts";

const CID_A = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const CID_B = "bafkreib6mcn5wfqnkwmwqcsf6ztcoph6jswvvmsztb6wdjqe7p5frcg3sy";

function refOf(value: string) {
  return { kind: "content" as const, protocol: "ipfs" as const, value };
}

function makePolicy() {
  const store = createSiteMountStore(new MemoryDatastore());
  const helia = { pins: { rm: vi.fn(async () => {}) } } as any;
  const policy = createMountPolicy({ store, helia });
  return { policy, helia, store };
}

describe("mount-policy", () => {
  test("writeCurrent sets current and clears pending", async () => {
    const { policy } = makePolicy();
    await policy.writeCurrent(refOf("bafyA"));
    const mount = await policy.read();
    expect(mount.current?.value).toBe("bafyA");
    expect(mount.pending).toBe(null);
  });

  test("writeCurrent preserves lastChecked when provided, else keeps prior", async () => {
    const { policy } = makePolicy();
    await policy.writeCurrent(refOf("bafyA"), { lastChecked: 42 });
    expect((await policy.read()).lastChecked).toBe(42);
    await policy.writeCurrent(refOf("bafyB"));
    expect((await policy.read()).lastChecked).toBe(42);
  });

  test("writePending rejects when current is null", async () => {
    const { policy } = makePolicy();
    await expect(policy.writePending(refOf("bafy"))).rejects.toThrow(
      /current must be set/i,
    );
  });

  test("writePending succeeds after writeCurrent", async () => {
    const { policy } = makePolicy();
    await policy.writeCurrent(refOf("bafyA"));
    await policy.writePending(refOf("bafyB"));
    const mount = await policy.read();
    expect(mount.current?.value).toBe("bafyA");
    expect(mount.pending?.value).toBe("bafyB");
  });

  test("tryPromote no-ops when pending is null", async () => {
    const { policy, helia } = makePolicy();
    await policy.writeCurrent(refOf("bafyA"));
    await policy.tryPromote({
      clients: { matchAll: vi.fn(async () => []) } as any,
      ensName: "x.eth",
    });
    expect(helia.pins.rm).not.toHaveBeenCalled();
    expect((await policy.read()).current?.value).toBe("bafyA");
  });

  test("tryPromote no-ops when a window exists", async () => {
    const { policy, helia } = makePolicy();
    await policy.writeCurrent(refOf("bafyA"));
    await policy.writePending(refOf("bafyB"));
    await policy.tryPromote({
      clients: { matchAll: vi.fn(async () => [{ type: "window" }]) } as any,
      ensName: "x.eth",
    });
    expect(helia.pins.rm).not.toHaveBeenCalled();
    const mount = await policy.read();
    expect(mount.current?.value).toBe("bafyA");
    expect(mount.pending?.value).toBe("bafyB");
  });

  test("tryPromote swaps pending → current when no windows; unpins old", async () => {
    const { policy, helia } = makePolicy();
    await policy.writeCurrent(refOf(CID_A));
    await policy.writePending(refOf(CID_B));
    await policy.tryPromote({
      clients: { matchAll: vi.fn(async () => []) } as any,
      ensName: "x.eth",
    });
    const mount = await policy.read();
    expect(mount.current?.value).toBe(CID_B);
    expect(mount.pending).toBe(null);
    expect(helia.pins.rm).toHaveBeenCalledTimes(1);
  });

  test("tryPromote swallows pins.rm errors", async () => {
    const store = createSiteMountStore(new MemoryDatastore());
    const helia = {
      pins: {
        rm: vi.fn(async () => {
          throw new Error("boom");
        }),
      },
    } as any;
    const policy = createMountPolicy({ store, helia });
    await policy.writeCurrent(refOf(CID_A));
    await policy.writePending(refOf(CID_B));
    await policy.tryPromote({
      clients: { matchAll: vi.fn(async () => []) } as any,
      ensName: "x.eth",
    });
    expect((await policy.read()).current?.value).toBe(CID_B);
  });
});
