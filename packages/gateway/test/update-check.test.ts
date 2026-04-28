import { createSiteMountStore, type Handlers } from "@cypsela/gateway-sw-core";
import { MemoryDatastore } from "datastore-core";
import { describe, expect, test, vi } from "vitest";
import { createMountPolicy } from "../src/mount-policy.ts";
import { createEnsurePinned } from "../src/pinning.ts";
import { createUpdateCheck } from "../src/update-check.ts";

function content(protocol: string, value: string) {
  return { kind: "content" as const, protocol, value };
}

function fakeIter() {
  return {
    next: async () => ({ value: undefined, done: true }),
    [Symbol.asyncIterator]() {
      return this;
    },
  } as any;
}

function setup(
  terminal: { kind: "content"; protocol: string; value: string; },
) {
  const store = createSiteMountStore(new MemoryDatastore());
  const helia = { pins: { add: vi.fn(() => fakeIter()), rm: vi.fn() } } as any;
  const policy = createMountPolicy({ store, helia });
  const handlers: Handlers = {
    resolvers: { ens: { protocol: "ens", resolve: async () => terminal } },
    fetchers: {},
  };
  const ensurePinned = createEnsurePinned(helia);
  const uc = createUpdateCheck({ ensurePinned, handlers, policy, ttlMs: 1000 });
  return { policy, uc, helia };
}

const CID_A = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const CID_B = "bafkreib6mcn5wfqnkwmwqcsf6ztcoph6jswvvmsztb6wdjqe7p5frcg3sy";
const CID_NEW = "bafybeihdwdcefgh4dqkjv67uzcmw772ole2vszp5u6ys5iobj2aoroghda";

describe("update-check", () => {
  test("no-change against current: no pending write, silent", async () => {
    const { policy, uc, helia } = setup(content("ipfs", CID_A));
    await policy.writeCurrent(content("ipfs", CID_A));
    await uc.run("x.eth");
    expect((await policy.read()).pending).toBe(null);
    expect(helia.pins.add).not.toHaveBeenCalled();
  });

  test("no-change against pending: no pending write", async () => {
    const { policy, uc, helia } = setup(content("ipfs", CID_B));
    await policy.writeCurrent(content("ipfs", CID_A));
    await policy.writePending(content("ipfs", CID_B));
    await uc.run("x.eth");
    expect((await policy.read()).pending?.value).toBe(CID_B);
    expect(helia.pins.add).not.toHaveBeenCalled();
  });

  test("change detected: pins root then writes pending", async () => {
    const { policy, uc, helia } = setup(content("ipfs", CID_NEW));
    await policy.writeCurrent(content("ipfs", CID_A));
    await uc.run("x.eth");
    expect(helia.pins.add).toHaveBeenCalledTimes(1);
    expect((await policy.read()).pending?.value).toBe(CID_NEW);
  });

  test("root-fetch failure: no pending write, warn logged", async () => {
    const store = createSiteMountStore(new MemoryDatastore());
    const helia = {
      pins: {
        add: vi.fn(() => ({
          next: async () => {
            throw new Error("offline");
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        })),
        rm: vi.fn(),
      },
    } as any;
    const policy = createMountPolicy({ store, helia });
    const handlers: Handlers = {
      resolvers: {
        ens: {
          protocol: "ens",
          resolve: async () => content("ipfs", CID_NEW),
        },
      },
      fetchers: {},
    };
    const ensurePinned = createEnsurePinned(helia);
    const uc = createUpdateCheck({
      ensurePinned,
      handlers,
      policy,
      ttlMs: 1000,
    });
    await policy.writeCurrent(content("ipfs", CID_A));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await uc.run("x.eth");
    expect((await policy.read()).pending).toBe(null);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("SWR dedups concurrent triggers to one resolve call", async () => {
    const resolve = vi.fn(async () => content("ipfs", CID_A));
    const store = createSiteMountStore(new MemoryDatastore());
    const helia = {
      pins: { add: vi.fn(() => fakeIter()), rm: vi.fn() },
    } as any;
    const policy = createMountPolicy({ store, helia });
    await policy.writeCurrent(content("ipfs", CID_A));
    const handlers: Handlers = {
      resolvers: { ens: { protocol: "ens", resolve } },
      fetchers: {},
    };
    const ensurePinned = createEnsurePinned(helia);
    const uc = createUpdateCheck({
      ensurePinned,
      handlers,
      policy,
      ttlMs: 1000,
    });
    await Promise.all([uc.run("x.eth"), uc.run("x.eth"), uc.run("x.eth")]);
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});
