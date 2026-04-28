import { MemoryDatastore } from "datastore-core";
import { Key } from "interface-datastore";
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

  test("read discards legacy flat-current shape (pre-CurrentMount nesting)", async () => {
    const ds = new MemoryDatastore();
    const enc = new TextEncoder();
    const legacy = {
      current: { kind: "content", protocol: "ipfs", value: "bafy-legacy" },
      pending: null,
      lastChecked: 999,
    };
    await ds.put(new Key("/sitemount"), enc.encode(JSON.stringify(legacy)));
    const store = createSiteMountStore(ds);
    expect(await store.read()).toEqual({
      current: null,
      pending: null,
      lastChecked: 0,
    });
  });

  test("read discards refs missing the kind discriminator", async () => {
    const ds = new MemoryDatastore();
    const enc = new TextEncoder();
    const broken = {
      current: { ref: { protocol: "ipfs", value: "bafyA" }, sw: null },
      pending: null,
      lastChecked: 0,
    };
    await ds.put(new Key("/sitemount"), enc.encode(JSON.stringify(broken)));
    const store = createSiteMountStore(ds);
    expect(await store.read()).toEqual({
      current: null,
      pending: null,
      lastChecked: 0,
    });
  });

  test("read deletes the bad row so subsequent reads skip validation", async () => {
    const ds = new MemoryDatastore();
    const enc = new TextEncoder();
    await ds.put(
      new Key("/sitemount"),
      enc.encode(JSON.stringify({ current: { foo: "bar" }, pending: null })),
    );
    const store = createSiteMountStore(ds);
    await store.read();
    expect(await ds.has(new Key("/sitemount"))).toBe(false);
  });

  test("read returns defaults on malformed JSON", async () => {
    const ds = new MemoryDatastore();
    const enc = new TextEncoder();
    await ds.put(new Key("/sitemount"), enc.encode("not json {{{"));
    const store = createSiteMountStore(ds);
    expect(await store.read()).toEqual({
      current: null,
      pending: null,
      lastChecked: 0,
    });
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
