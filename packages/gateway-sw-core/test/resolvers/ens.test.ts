import { describe, expect, test, vi } from "vitest";
import {
  ContenthashNotFound,
  EnsResolveFailed,
  UnsupportedProtocol,
} from "../../src/errors.js";
import {
  createEnsResolverFromClient,
  createRacingEnsResolver,
} from "../../src/resolvers/ens.js";

vi.mock("@ensdomains/ensjs/public", () => ({ getContentHashRecord: vi.fn() }));

import { getContentHashRecord } from "@ensdomains/ensjs/public";
const mocked = vi.mocked(getContentHashRecord);

describe("ens resolver", () => {
  const client = {} as any;

  test("protocol is 'ens'", () => {
    const r = createEnsResolverFromClient(client);
    expect(r.protocol).toBe("ens");
  });

  test("ipfs contenthash resolves to a content reference", async () => {
    mocked.mockResolvedValueOnce({ protocolType: "ipfs", decoded: "bafy" });
    const r = createEnsResolverFromClient(client);
    const out = await r.resolve({
      kind: "address",
      protocol: "ens",
      value: "vitalik.eth",
    });
    expect(out).toEqual({ kind: "content", protocol: "ipfs", value: "bafy" });
  });

  test("ipns contenthash resolves to an address reference (still needs IPNS hop)", async () => {
    mocked.mockResolvedValueOnce({ protocolType: "ipns", decoded: "k51" });
    const r = createEnsResolverFromClient(client);
    const out = await r.resolve({
      kind: "address",
      protocol: "ens",
      value: "x.eth",
    });
    expect(out).toEqual({ kind: "address", protocol: "ipns", value: "k51" });
  });

  test("null record → ContenthashNotFound", async () => {
    mocked.mockResolvedValueOnce(null);
    const r = createEnsResolverFromClient(client);
    await expect(
      r.resolve({ kind: "address", protocol: "ens", value: "ghost.eth" }),
    )
      .rejects
      .toBeInstanceOf(ContenthashNotFound);
  });

  test("empty decoded → EnsResolveFailed (no cause)", async () => {
    mocked.mockResolvedValueOnce({ protocolType: "ipfs", decoded: "" });
    const r = createEnsResolverFromClient(client);
    try {
      await r.resolve({ kind: "address", protocol: "ens", value: "empty.eth" });
      throw new Error("expected resolve to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(EnsResolveFailed);
      expect((err as { cause?: unknown; }).cause).toBeUndefined();
    }
  });

  test("non ipfs/ipns protocol → UnsupportedProtocol", async () => {
    mocked.mockResolvedValueOnce(
      { protocolType: "swarm", decoded: "xyz" } as any,
    );
    const r = createEnsResolverFromClient(client);
    await expect(
      r.resolve({ kind: "address", protocol: "ens", value: "weird.eth" }),
    )
      .rejects
      .toBeInstanceOf(UnsupportedProtocol);
  });

  test("getContentHashRecord rejection → EnsResolveFailed wraps cause", async () => {
    const cause = new Error("rpc unreachable");
    mocked.mockRejectedValueOnce(cause);
    const r = createEnsResolverFromClient(client);
    try {
      await r.resolve({ kind: "address", protocol: "ens", value: "x.eth" });
      throw new Error("expected resolve to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(EnsResolveFailed);
      expect((err as { cause?: unknown; }).cause).toBe(cause);
    }
  });
});

describe("createRacingEnsResolver", () => {
  const opts = { rpcUrls: ["https://r1", "https://r2", "https://r3"] };

  test("first resolving client wins; reference is decoded", async () => {
    mocked.mockResolvedValueOnce({ protocolType: "ipfs", decoded: "bafy" });
    mocked.mockRejectedValueOnce(new Error("rpc 2 failed"));
    mocked.mockRejectedValueOnce(new Error("rpc 3 failed"));
    const r = createRacingEnsResolver(opts);
    const out = await r.resolve({
      kind: "address",
      protocol: "ens",
      value: "v.eth",
    });
    expect(out).toEqual({ kind: "content", protocol: "ipfs", value: "bafy" });
  });

  test("all clients reject → EnsResolveFailed with AggregateError cause", async () => {
    mocked.mockRejectedValueOnce(new Error("rpc 1 failed"));
    mocked.mockRejectedValueOnce(new Error("rpc 2 failed"));
    mocked.mockRejectedValueOnce(new Error("rpc 3 failed"));
    const r = createRacingEnsResolver(opts);
    try {
      await r.resolve({ kind: "address", protocol: "ens", value: "v.eth" });
      throw new Error("expected resolve to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(EnsResolveFailed);
      const cause = (err as { cause?: unknown; }).cause;
      expect(cause).toBeInstanceOf(AggregateError);
      expect((cause as AggregateError).errors).toHaveLength(3);
    }
  });
});
