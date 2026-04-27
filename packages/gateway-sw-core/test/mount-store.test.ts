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
      current: {
        ref: { kind: "content", protocol: "ipfs", value: "bafyA" },
        sw: null,
      },
      pending: null,
      lastChecked: 1234,
    });
    const mount = await store.read();
    expect(mount).toEqual({
      current: {
        ref: { kind: "content", protocol: "ipfs", value: "bafyA" },
        sw: null,
      },
      pending: null,
      lastChecked: 1234,
    });
  });

  test("round-trips current.sw when set", async () => {
    const store = createSiteMountStore(new MemoryDatastore());
    await store.write({
      current: {
        ref: { kind: "content", protocol: "ipfs", value: "bafyA" },
        sw: { swUrl: "/sw.js", swInstalled: true, swActivated: true },
      },
      pending: null,
      lastChecked: 0,
    });
    expect((await store.read()).current?.sw?.swUrl).toBe("/sw.js");
  });

  test("write overwrites the single row (no accumulation)", async () => {
    const store = createSiteMountStore(new MemoryDatastore());
    await store.write({
      current: {
        ref: { kind: "content", protocol: "ipfs", value: "bafyA" },
        sw: null,
      },
      pending: null,
      lastChecked: 1,
    });
    await store.write({
      current: {
        ref: { kind: "content", protocol: "ipfs", value: "bafyB" },
        sw: null,
      },
      pending: { kind: "content", protocol: "ipfs", value: "bafyC" },
      lastChecked: 2,
    });
    const mount = await store.read();
    expect(mount.current?.ref.value).toBe("bafyB");
    expect(mount.pending?.value).toBe("bafyC");
    expect(mount.lastChecked).toBe(2);
  });

  test("clear resets to defaults", async () => {
    const store = createSiteMountStore(new MemoryDatastore());
    await store.write({
      current: {
        ref: { kind: "content", protocol: "ipfs", value: "bafy" },
        sw: null,
      },
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
      current: {
        ref: { kind: "content", protocol: "ipfs", value: "bafyA" },
        sw: null,
      },
      pending: null,
      lastChecked: 1,
    });
    await b.write({
      current: {
        ref: { kind: "content", protocol: "ipfs", value: "bafyB" },
        sw: null,
      },
      pending: null,
      lastChecked: 2,
    });
    expect((await a.read()).current?.ref.value).toBe("bafyA");
    expect((await b.read()).current?.ref.value).toBe("bafyB");
  });
});
