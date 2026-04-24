import { describe, expect, test, vi } from "vitest";
import {
  EnsNotFound,
  NoContenthash,
  UnsupportedProtocol,
} from "../../src/errors.js";
import { createEnsResolverFromClient } from "../../src/resolvers/ens.js";

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

  test("null record → EnsNotFound", async () => {
    mocked.mockResolvedValueOnce(null);
    const r = createEnsResolverFromClient(client);
    await expect(
      r.resolve({ kind: "address", protocol: "ens", value: "ghost.eth" }),
    )
      .rejects
      .toBeInstanceOf(EnsNotFound);
  });

  test("empty decoded → NoContenthash", async () => {
    mocked.mockResolvedValueOnce({ protocolType: "ipfs", decoded: "" });
    const r = createEnsResolverFromClient(client);
    await expect(
      r.resolve({ kind: "address", protocol: "ens", value: "empty.eth" }),
    )
      .rejects
      .toBeInstanceOf(NoContenthash);
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
});
