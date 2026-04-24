import { MemoryDatastore } from "datastore-core";
import { describe, expect, test } from "vitest";
import { createSiteMountStore } from "../src/mount-store.js";

describe("createSiteMountStore", () => {
  test("read returns defaults when no row exists", async () => {
    const store = createSiteMountStore(new MemoryDatastore());
    const mount = await store.read();
    expect(mount).toEqual({ current: null, pending: null, lastChecked: 0 });
  });

  test("write then read round-trips the same value", async () => {
    const store = createSiteMountStore(new MemoryDatastore());
    await store.write({
      current: { kind: "content", protocol: "ipfs", value: "bafyA" },
      pending: null,
      lastChecked: 1234,
    });
    const mount = await store.read();
    expect(mount).toEqual({
      current: { kind: "content", protocol: "ipfs", value: "bafyA" },
      pending: null,
      lastChecked: 1234,
    });
  });

  test("write overwrites the single row (no accumulation)", async () => {
    const store = createSiteMountStore(new MemoryDatastore());
    await store.write({
      current: { kind: "content", protocol: "ipfs", value: "bafyA" },
      pending: null,
      lastChecked: 1,
    });
    await store.write({
      current: { kind: "content", protocol: "ipfs", value: "bafyB" },
      pending: { kind: "content", protocol: "ipfs", value: "bafyC" },
      lastChecked: 2,
    });
    const mount = await store.read();
    expect(mount.current?.value).toBe("bafyB");
    expect(mount.pending?.value).toBe("bafyC");
    expect(mount.lastChecked).toBe(2);
  });

  test("clear resets to defaults", async () => {
    const store = createSiteMountStore(new MemoryDatastore());
    await store.write({
      current: { kind: "content", protocol: "ipfs", value: "bafy" },
      pending: null,
      lastChecked: 5,
    });
    await store.clear();
    const mount = await store.read();
    expect(mount).toEqual({ current: null, pending: null, lastChecked: 0 });
  });

  test("custom key works (multi-mount datastore)", async () => {
    const ds = new MemoryDatastore();
    const a = createSiteMountStore(ds, { key: "/mount-a" });
    const b = createSiteMountStore(ds, { key: "/mount-b" });
    await a.write({
      current: { kind: "content", protocol: "ipfs", value: "bafyA" },
      pending: null,
      lastChecked: 1,
    });
    await b.write({
      current: { kind: "content", protocol: "ipfs", value: "bafyB" },
      pending: null,
      lastChecked: 2,
    });
    expect((await a.read()).current?.value).toBe("bafyA");
    expect((await b.read()).current?.value).toBe("bafyB");
  });
});
