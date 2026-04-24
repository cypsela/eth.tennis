import { describe, expect, test, vi } from "vitest";
import {
  IpnsRecordNotFound,
  IpnsRecordUnverifiable,
} from "../../src/errors.js";
import { createIpnsResolverFromImpl } from "../../src/resolvers/ipns.js";

const IPNS_KEY =
  "k51qzi5uqu5dktsyfv7xz8h631pri4ct7osmb43nibxiojpttxzoft6hdyyzg4";

describe("ipns resolver", () => {
  test("protocol is 'ipns'", () => {
    const r = createIpnsResolverFromImpl({ resolve: vi.fn() } as any);
    expect(r.protocol).toBe("ipns");
  });

  test("resolves to a ContentReference with the resolved CID", async () => {
    const resolver = {
      resolve: vi.fn(async () => ({
        cid: { toString: () => "bafyResolved" },
        path: "",
      })),
    } as any;
    const r = createIpnsResolverFromImpl(resolver);
    const out = await r.resolve({
      kind: "address",
      protocol: "ipns",
      value: IPNS_KEY,
    });
    expect(out).toEqual({
      kind: "content",
      protocol: "ipfs",
      value: "bafyResolved",
    });
  });

  test("RecordNotFoundError → IpnsRecordNotFound", async () => {
    const resolver = {
      resolve: vi.fn(async () => {
        const err = new Error("not found");
        err.name = "RecordNotFoundError";
        throw err;
      }),
    } as any;
    const r = createIpnsResolverFromImpl(resolver);
    await expect(
      r.resolve({ kind: "address", protocol: "ipns", value: IPNS_KEY }),
    )
      .rejects
      .toBeInstanceOf(IpnsRecordNotFound);
  });

  test("RecordsFailedValidationError → IpnsRecordUnverifiable", async () => {
    const resolver = {
      resolve: vi.fn(async () => {
        const err = new Error("bad sig");
        err.name = "RecordsFailedValidationError";
        throw err;
      }),
    } as any;
    const r = createIpnsResolverFromImpl(resolver);
    await expect(
      r.resolve({ kind: "address", protocol: "ipns", value: IPNS_KEY }),
    )
      .rejects
      .toBeInstanceOf(IpnsRecordUnverifiable);
  });

  test("unknown errors propagate unchanged", async () => {
    const resolver = {
      resolve: vi.fn(async () => {
        throw new Error("something else");
      }),
    } as any;
    const r = createIpnsResolverFromImpl(resolver);
    await expect(
      r.resolve({ kind: "address", protocol: "ipns", value: IPNS_KEY }),
    )
      .rejects
      .toThrow("something else");
  });
});
