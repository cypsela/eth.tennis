import { describe, expect, test } from "vitest";
import type {
  AddressReference,
  ContentFetcher,
  ContentReference,
  Handlers,
  Reference,
  Resolver,
  SiteMount,
} from "../src/types.js";

describe("Reference types", () => {
  test("AddressReference carries kind 'address'", () => {
    const ref: AddressReference<"ens"> = {
      kind: "address",
      protocol: "ens",
      value: "vitalik.eth",
    };
    expect(ref.kind).toBe("address");
    expect(ref.protocol).toBe("ens");
  });

  test("ContentReference carries kind 'content'", () => {
    const ref: ContentReference<"ipfs"> = {
      kind: "content",
      protocol: "ipfs",
      value: "bafy",
    };
    expect(ref.kind).toBe("content");
  });

  test("Reference union narrows on kind", () => {
    const ref: Reference = { kind: "address", protocol: "ens", value: "x.eth" };
    if (ref.kind === "address") {
      expect(ref.value).toBe("x.eth");
    } else {
      throw new Error("unreachable");
    }
  });

  test("Resolver and ContentFetcher are assignable", () => {
    const resolver: Resolver<"ens"> = {
      protocol: "ens",
      async resolve(ref) {
        return { kind: "content", protocol: "ipfs", value: ref.value };
      },
    };
    const fetcher: ContentFetcher<"ipfs"> = {
      protocol: "ipfs",
      async fetch() {
        return new Response("ok");
      },
    };
    const handlers: Handlers = {
      resolvers: { ens: resolver },
      fetchers: { ipfs: fetcher },
    };
    expect(handlers.resolvers["ens"]).toBe(resolver);
    expect(handlers.fetchers["ipfs"]).toBe(fetcher);
  });

  test("SiteMount shape accepts null slots", () => {
    const mount: SiteMount = { current: null, pending: null, lastChecked: 0 };
    expect(mount.current).toBe(null);
  });
});
