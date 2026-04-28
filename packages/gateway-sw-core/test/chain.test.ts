import { describe, expect, test, vi } from "vitest";
import { fetchReference, resolveReference } from "../src/chain.js";
import {
  FetchTimeout,
  NoHandler,
  ResolutionLoop,
  ResolveTimeout,
} from "../src/errors.js";
import type {
  AddressReference,
  ContentReference,
  Handlers,
  Reference,
  Resolver,
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

describe("resolveReference timeouts and signals", () => {
  function delayedResolver(delayMs: number, next: Reference): Resolver<string> {
    return {
      protocol: "ipns",
      resolve: (_ref, opts) =>
        new Promise((resolve, reject) => {
          const t = setTimeout(() => resolve(next), delayMs);
          opts?.signal?.addEventListener("abort", () => {
            clearTimeout(t);
            reject(opts.signal!.reason ?? new Error("aborted"));
          });
        }),
    };
  }

  test("slow resolver exceeds resolveStepMs → ResolveTimeout", async () => {
    const handlers: Handlers = {
      resolvers: { ipns: delayedResolver(200, content("ipfs", "bafy")) },
      fetchers: {},
    };
    await expect(
      resolveReference(addr("ipns", "k51"), handlers, { resolveStepMs: 50 }),
    )
      .rejects
      .toBeInstanceOf(ResolveTimeout);
  });

  test("budget is per step (two slow hops within budget each succeed)", async () => {
    let calls = 0;
    const handlers: Handlers = {
      resolvers: {
        ens: {
          protocol: "ens",
          resolve: () =>
            new Promise<Reference>((r) =>
              setTimeout(() => r(addr("ipns", "k51")), 30)
            ),
        },
        ipns: {
          protocol: "ipns",
          resolve: () =>
            new Promise<Reference>((r) => {
              calls++;
              setTimeout(() => r(content("ipfs", "bafy")), 30);
            }),
        },
      },
      fetchers: {},
    };
    const out = await resolveReference(addr("ens", "x.eth"), handlers, {
      resolveStepMs: 100,
    });
    expect(out).toEqual(content("ipfs", "bafy"));
    expect(calls).toBe(1);
  });

  test("caller signal abort propagates without ResolveTimeout wrap", async () => {
    const ctrl = new AbortController();
    const handlers: Handlers = {
      resolvers: { ipns: delayedResolver(1_000, content("ipfs", "bafy")) },
      fetchers: {},
    };
    setTimeout(() => ctrl.abort(new Error("user cancel")), 10);
    await expect(
      resolveReference(addr("ipns", "k51"), handlers, {
        resolveStepMs: 5_000,
        signal: ctrl.signal,
      }),
    )
      .rejects
      .toMatchObject({ message: "user cancel" });
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

  test("slow fetch exceeds fetchTimeoutMs → FetchTimeout", async () => {
    const handlers: Handlers = {
      resolvers: {},
      fetchers: {
        ipfs: {
          protocol: "ipfs",
          fetch: (_ref, _path, opts) =>
            new Promise((_resolve, reject) => {
              opts?.signal?.addEventListener("abort", () =>
                reject(
                  opts.signal!.reason ?? new Error("aborted"),
                ));
            }),
        },
      },
    };
    await expect(
      fetchReference(content("ipfs", "bafy"), "/", handlers, {
        fetchTimeoutMs: 50,
      }),
    )
      .rejects
      .toBeInstanceOf(FetchTimeout);
  });
});
