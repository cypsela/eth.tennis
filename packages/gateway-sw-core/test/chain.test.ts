import { describe, expect, test, vi } from "vitest";
import { fetchReference, resolveReference } from "../src/chain.js";
import { NoHandler, ResolutionLoop } from "../src/errors.js";
import type {
  AddressReference,
  ContentReference,
  Handlers,
  Reference,
} from "../src/types.js";

function addr(protocol: string, value: string): AddressReference {
  return { kind: "address", protocol, value };
}
function content(protocol: string, value: string): ContentReference {
  return { kind: "content", protocol, value };
}

describe("resolveReference", () => {
  test("returns a ContentReference unchanged", async () => {
    const handlers: Handlers = { resolvers: {}, fetchers: {} };
    const start = content("ipfs", "bafy");
    const out = await resolveReference(start, handlers);
    expect(out).toEqual(start);
  });

  test("walks ens → ipns → ipfs", async () => {
    const handlers: Handlers = {
      resolvers: {
        ens: {
          protocol: "ens",
          resolve: async () => addr("ipns", "k51"),
        },
        ipns: {
          protocol: "ipns",
          resolve: async () => content("ipfs", "bafy"),
        },
      },
      fetchers: {},
    };
    const out = await resolveReference(addr("ens", "x.eth"), handlers);
    expect(out).toEqual(content("ipfs", "bafy"));
  });

  test("fires onHop per step with from/to", async () => {
    const hops: Array<[Reference, Reference]> = [];
    const handlers: Handlers = {
      resolvers: {
        ens: {
          protocol: "ens",
          resolve: async () => content("ipfs", "bafy"),
        },
      },
      fetchers: {},
    };
    await resolveReference(addr("ens", "x.eth"), handlers, {
      onHop: (from, to) => hops.push([from, to]),
    });
    expect(hops.length).toBe(1);
    expect(hops[0]![0].value).toBe("x.eth");
    expect(hops[0]![1].value).toBe("bafy");
  });

  test("throws NoHandler for an address with no matching resolver", async () => {
    const handlers: Handlers = { resolvers: {}, fetchers: {} };
    await expect(resolveReference(addr("swarm", "xyz"), handlers)).rejects
      .toBeInstanceOf(NoHandler);
  });

  test("throws ResolutionLoop when maxHops is exceeded", async () => {
    const handlers: Handlers = {
      resolvers: {
        ipns: {
          protocol: "ipns",
          resolve: async () => addr("ipns", "loop"),
        },
      },
      fetchers: {},
    };
    await expect(
      resolveReference(addr("ipns", "loop"), handlers, { maxHops: 3 }),
    )
      .rejects
      .toBeInstanceOf(ResolutionLoop);
  });

  test("default maxHops is 8", async () => {
    let count = 0;
    const handlers: Handlers = {
      resolvers: {
        ipns: {
          protocol: "ipns",
          resolve: async () => {
            count++;
            return addr("ipns", `v${count}`);
          },
        },
      },
      fetchers: {},
    };
    await expect(resolveReference(addr("ipns", "start"), handlers)).rejects
      .toBeInstanceOf(ResolutionLoop);
    expect(count).toBe(8);
  });
});

describe("fetchReference", () => {
  test("resolves then invokes fetcher with terminal ref + path", async () => {
    const fetchFn = vi.fn(async () => new Response("hi", { status: 200 }));
    const handlers: Handlers = {
      resolvers: {
        ens: {
          protocol: "ens",
          resolve: async () => content("ipfs", "bafy"),
        },
      },
      fetchers: { ipfs: { protocol: "ipfs", fetch: fetchFn } },
    };
    const res = await fetchReference(addr("ens", "x.eth"), "/i.html", handlers);
    expect(fetchFn).toHaveBeenCalledWith({
      kind: "content",
      protocol: "ipfs",
      value: "bafy",
    }, "/i.html");
    expect(await res.text()).toBe("hi");
  });

  test("throws NoHandler when the terminal ref has no fetcher", async () => {
    const handlers: Handlers = { resolvers: {}, fetchers: {} };
    await expect(fetchReference(content("ipfs", "bafy"), "/", handlers)).rejects
      .toBeInstanceOf(NoHandler);
  });
});
