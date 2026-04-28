import { describe, expect, test, vi } from "vitest";
import {
  ContentHashNotSet,
  EnsResolveFailed,
  IpnsAddressUnrecognized,
} from "../../src/errors.js";
import {
  createEnsResolverFromClient,
  createRacingEnsResolver,
  looksLikeDomain,
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

  test("ipns contenthash with a CID-shape value → ipns address ref", async () => {
    const cid =
      "k51qzi5uqu5dktsyfv7xz8h631pri4ct7osmb43nibxiojpttxzoft6hdyyzg4";
    mocked.mockResolvedValueOnce({ protocolType: "ipns", decoded: cid });
    const r = createEnsResolverFromClient(client);
    const out = await r.resolve({
      kind: "address",
      protocol: "ens",
      value: "nick.eth",
    });
    expect(out).toEqual({ kind: "address", protocol: "ipns", value: cid });
  });

  test("ipns contenthash with a domain value → dnslink address ref", async () => {
    mocked.mockResolvedValueOnce({
      protocolType: "ipns",
      decoded: "app.uniswap.org",
    });
    const r = createEnsResolverFromClient(client);
    const out = await r.resolve({
      kind: "address",
      protocol: "ens",
      value: "uniswap.eth",
    });
    expect(out).toEqual({
      kind: "address",
      protocol: "dnslink",
      value: "app.uniswap.org",
    });
  });

  test("ipns contenthash with a non-CID, non-domain value → IpnsAddressUnrecognized", async () => {
    mocked.mockResolvedValueOnce({ protocolType: "ipns", decoded: "!!!" });
    const r = createEnsResolverFromClient(client);
    await expect(
      r.resolve({ kind: "address", protocol: "ens", value: "weird.eth" }),
    )
      .rejects
      .toBeInstanceOf(IpnsAddressUnrecognized);
  });

  test("null record → ContentHashNotSet", async () => {
    mocked.mockResolvedValueOnce(null);
    const r = createEnsResolverFromClient(client);
    await expect(
      r.resolve({ kind: "address", protocol: "ens", value: "ghost.eth" }),
    )
      .rejects
      .toBeInstanceOf(ContentHashNotSet);
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

  test("non ipfs/ipns protocol → raw AddressReference (no throw, NoHandler comes later)", async () => {
    mocked.mockResolvedValueOnce(
      { protocolType: "swarm", decoded: "xyz" } as any,
    );
    const r = createEnsResolverFromClient(client);
    const out = await r.resolve({
      kind: "address",
      protocol: "ens",
      value: "weird.eth",
    });
    expect(out).toEqual({ kind: "address", protocol: "swarm", value: "xyz" });
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

describe("looksLikeDomain", () => {
  test.each([["app.uniswap.org", true], ["blog.ipfs.io", true], ["a.b", true], [
    "a-b.c",
    true,
  ], ["xn--m-vea.com", true]])("%s → %s", (input, expected) => {
    expect(looksLikeDomain(input)).toBe(expected);
  });

  test.each([
    [""],
    ["nodot"],
    [".start"],
    ["end."],
    ["-leadinghyphen.com"],
    ["trailinghyphen-.com"],
    ["has space.com"],
    ["!!!"],
    ["k51qzi5uqu5dktsyfv7xz8h631pri4ct7osmb43nibxiojpttxzoft6hdyyzg4"],
  ])("rejects %s", (input) => {
    expect(looksLikeDomain(input)).toBe(false);
  });

  test("rejects label > 63 chars", () => {
    const tooLong = "a".repeat(64) + ".com";
    expect(looksLikeDomain(tooLong)).toBe(false);
  });

  test("rejects total > 253 chars", () => {
    const tooLong = ("a".repeat(50) + ".").repeat(6);
    expect(looksLikeDomain(tooLong)).toBe(false);
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
