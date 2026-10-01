import { CID } from "multiformats/cid";
import { describe, expect, test, vi } from "vitest";
import {
  DnslinkRecordNotFound,
  DnslinkResolveFailed,
} from "../../src/errors.js";
import { createDnslinkResolverFromImpl } from "../../src/resolvers/dnslink.js";

const DOMAIN = "app.uniswap.org";
const IPNS_NAME =
  "k51qzi5uqu5dktsyfv7xz8h631pri4ct7osmb43nibxiojpttxzoft6hdyyzg4";

function impl(resolveFn: (...args: any[]) => any) {
  return { resolve: vi.fn(resolveFn) } as any;
}

describe("dnslink resolver", () => {
  test("protocol is 'dnslink'", () => {
    const r = createDnslinkResolverFromImpl(impl(async () => []));
    expect(r.protocol).toBe("dnslink");
  });

  test("ipfs namespace → ContentReference<'ipfs'>", async () => {
    const r = createDnslinkResolverFromImpl(
      impl(async () => [{
        namespace: "ipfs",
        cid: { toString: () => "bafyResolved" },
        path: "",
        answer: {} as any,
      }]),
    );
    const out = await r.resolve({
      kind: "address",
      protocol: "dnslink",
      value: DOMAIN,
    });
    expect(out).toEqual({
      kind: "content",
      protocol: "ipfs",
      value: "bafyResolved",
    });
  });

  test("ipns namespace → AddressReference<'ipns'>", async () => {
    const r = createDnslinkResolverFromImpl(
      impl(async () => [{
        namespace: "ipns",
        value: CID.parse(IPNS_NAME).multihash,
        path: "",
        answer: {} as any,
      }]),
    );
    const out = await r.resolve({
      kind: "address",
      protocol: "dnslink",
      value: DOMAIN,
    });
    expect(out).toEqual({
      kind: "address",
      protocol: "ipns",
      value: IPNS_NAME,
    });
  });

  test("prefers ipfs result when both ipfs and ipns are present", async () => {
    const r = createDnslinkResolverFromImpl(
      impl(async () => [{
        namespace: "ipns",
        value: CID.parse(IPNS_NAME).multihash,
        path: "",
        answer: {} as any,
      }, {
        namespace: "ipfs",
        cid: { toString: () => "bafy" },
        path: "",
        answer: {} as any,
      }]),
    );
    const out = await r.resolve({
      kind: "address",
      protocol: "dnslink",
      value: DOMAIN,
    });
    expect(out).toEqual({ kind: "content", protocol: "ipfs", value: "bafy" });
  });

  test("warns and drops non-empty path component", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = createDnslinkResolverFromImpl(
      impl(async () => [{
        namespace: "ipfs",
        cid: { toString: () => "bafy" },
        path: "/blog",
        answer: {} as any,
      }]),
    );
    const out = await r.resolve({
      kind: "address",
      protocol: "dnslink",
      value: DOMAIN,
    });
    expect(out).toEqual({ kind: "content", protocol: "ipfs", value: "bafy" });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(`${DOMAIN} → /blog`),
    );
    warn.mockRestore();
  });

  test("DNSLinkNotFoundError → DnslinkRecordNotFound", async () => {
    const r = createDnslinkResolverFromImpl(impl(async () => {
      const err = new Error("nx");
      err.name = "DNSLinkNotFoundError";
      throw err;
    }));
    await expect(
      r.resolve({ kind: "address", protocol: "dnslink", value: DOMAIN }),
    )
      .rejects
      .toBeInstanceOf(DnslinkRecordNotFound);
  });

  test("empty results → DnslinkRecordNotFound", async () => {
    const r = createDnslinkResolverFromImpl(impl(async () => []));
    await expect(
      r.resolve({ kind: "address", protocol: "dnslink", value: DOMAIN }),
    )
      .rejects
      .toBeInstanceOf(DnslinkRecordNotFound);
  });

  test("other errors → DnslinkResolveFailed", async () => {
    const r = createDnslinkResolverFromImpl(impl(async () => {
      throw new Error("network down");
    }));
    await expect(
      r.resolve({ kind: "address", protocol: "dnslink", value: DOMAIN }),
    )
      .rejects
      .toBeInstanceOf(DnslinkResolveFailed);
  });

  test("unexpected namespace → DnslinkResolveFailed", async () => {
    const r = createDnslinkResolverFromImpl(
      impl(
        async () => [{
          namespace: "weird" as any,
          value: "x",
          path: "",
          answer: {} as any,
        }]
      ),
    );
    await expect(
      r.resolve({ kind: "address", protocol: "dnslink", value: DOMAIN }),
    )
      .rejects
      .toBeInstanceOf(DnslinkResolveFailed);
  });

  test("forwards signal to impl.resolve", async () => {
    const fn = vi.fn(
      async () => [{
        namespace: "ipfs",
        cid: { toString: () => "bafy" },
        path: "",
        answer: {} as any,
      }]
    );
    const r = createDnslinkResolverFromImpl({ resolve: fn } as any);
    const ctrl = new AbortController();
    await r.resolve({ kind: "address", protocol: "dnslink", value: DOMAIN }, {
      signal: ctrl.signal,
    });
    expect(fn).toHaveBeenCalledWith(DOMAIN, { signal: ctrl.signal });
  });

  function dnsQueryFailed(...inner: Error[]): Error {
    const err = new AggregateError(inner, "DNS lookup failed");
    err.name = "DNSQueryFailedError";
    return err;
  }
  function named(name: string): Error {
    const err = new Error(name);
    err.name = name;
    return err;
  }

  test("every DNS resolver answering empty → DnslinkRecordNotFound", async () => {
    const r = createDnslinkResolverFromImpl(impl(async () => {
      throw dnsQueryFailed(
        named("EmptyDNSAnswerError"),
        named("EmptyDNSAnswerError"),
      );
    }));
    await expect(
      r.resolve({ kind: "address", protocol: "dnslink", value: DOMAIN }),
    )
      .rejects
      .toBeInstanceOf(DnslinkRecordNotFound);
  });

  test("a DNS resolver failing outright → DnslinkResolveFailed", async () => {
    const r = createDnslinkResolverFromImpl(impl(async () => {
      throw dnsQueryFailed(named("EmptyDNSAnswerError"), named("TypeError"));
    }));
    await expect(
      r.resolve({ kind: "address", protocol: "dnslink", value: DOMAIN }),
    )
      .rejects
      .toBeInstanceOf(DnslinkResolveFailed);
  });
});
