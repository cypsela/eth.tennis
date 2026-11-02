import { MemoryBlockstore } from "blockstore-core";
import { MemoryDatastore } from "datastore-core";
import { createHeliaLight } from "helia";
import { CID } from "multiformats/cid";
import { afterEach, describe, expect, test } from "vitest";
import { delegatedRetrievalInit, deriveDbNames } from "../src/helia.js";
import { createIpnsResolver } from "../src/resolvers/ipns.js";

// sha2-256 of zero bytes: a block we can serve and have verified
const EMPTY_CID = "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";

describe("deriveDbNames", () => {
  test("default namespace yields library-prefixed DB names", () => {
    const { blocks, data } = deriveDbNames();
    expect(blocks).toBe("@cypsela/gateway-sw-core/blocks");
    expect(data).toBe("@cypsela/gateway-sw-core/data");
  });

  test("custom namespace is used as the prefix", () => {
    const { blocks, data } = deriveDbNames({ namespace: "eth.tennis" });
    expect(blocks).toBe("eth.tennis/blocks");
    expect(data).toBe("eth.tennis/data");
  });
});

describe("createGatewayHelia (smoke)", () => {
  test("exists as an async factory", async () => {
    const mod = await import("../src/helia.js");
    expect(typeof mod.createGatewayHelia).toBe("function");
  });
});

describe("delegatedRetrievalInit", () => {
  const noop = Object.assign(() => {}, {
    error: () => {},
    trace: () => {},
    enabled: false,
  });
  const logger = { forComponent: () => noop };
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  test("throws without router URLs", () => {
    expect(() => delegatedRetrievalInit([])).toThrow(
      "at least one delegated router URL is required",
    );
  });

  test("queries every router with the browser filters", async () => {
    const requested: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requested.push(String(input instanceof Request ? input.url : input));
      return json({ Providers: [] });
    }) as typeof fetch;
    const helia = await createHeliaLight({
      blockstore: new MemoryBlockstore(),
      datastore: new MemoryDatastore(),
      ...delegatedRetrievalInit(["https://r1.test", "https://r2.test"]),
    })
      .start();
    try {
      for await (
        const _ of helia.routing.findProviders(CID.parse(EMPTY_CID), {
          signal: AbortSignal.timeout(2000),
        })
      ) {
        /* drain */
      }
    } finally {
      await helia.stop();
    }
    for (const host of ["r1.test", "r2.test"]) {
      const url = requested.find((u) => new URL(u).host === host);
      expect(url, host).toBeDefined();
      const q = new URL(url!).searchParams;
      expect(q.get("filter-addrs")).toBe("https");
      expect(q.get("filter-protocols")).toBe(
        "transport-ipfs-gateway-http,unknown",
      );
    }
  });

  test("disables the delegated client cache on every router", async () => {
    const { routers } = delegatedRetrievalInit([
      "https://r1.test",
      "https://r2.test",
    ]);
    expect(routers).toHaveLength(2);
    for (const make of routers) {
      const router = (make as any)({ logger }) as {
        client: { cacheTTL: number; };
      };
      // cacheTTL 0 keeps router answers out of the SW's Cache Storage.
      expect(router.client.cacheTTL).toBe(0);
    }
  });

  test("a 200 text/plain IPNS answer is ipns-record-not-found", async () => {
    globalThis.fetch =
      (async () =>
        new Response("delegate error: routing: not found", {
          status: 200,
          headers: { "content-type": "text/plain" },
        })) as typeof fetch;
    const helia = await createHeliaLight({
      blockstore: new MemoryBlockstore(),
      datastore: new MemoryDatastore(),
      ...delegatedRetrievalInit(["https://r1.test"]),
    })
      .start();
    try {
      await expect(
        createIpnsResolver(helia).resolve({
          kind: "address",
          protocol: "ipns",
          value:
            "k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8",
        }, { signal: AbortSignal.timeout(2000) }),
      )
        .rejects
        .toMatchObject({ errorClass: "ipns-record-not-found" });
    } finally {
      await helia.stop();
    }
  });

  test("fetches a block from an https provider found through the router", async () => {
    const cid = CID.parse(EMPTY_CID);
    const requested: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      requested.push(url);
      if (url.startsWith("https://r1.test/routing/v1/providers/")) {
        return json({
          Providers: [{
            Schema: "peer",
            ID: "12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTN",
            Protocols: ["transport-ipfs-gateway-http"],
            Addrs: ["/dns4/p.test/tcp/443/https"],
          }],
        });
      }
      if (url === `https://p.test/ipfs/${cid}?format=raw`) {
        return new Response(new Uint8Array(0), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const helia = await createHeliaLight({
      blockstore: new MemoryBlockstore(),
      datastore: new MemoryDatastore(),
      ...delegatedRetrievalInit(["https://r1.test"]),
    })
      .start();
    try {
      let bytes = 0;
      for await (
        const chunk of helia.blockstore.get(cid, {
          signal: AbortSignal.timeout(2000),
        })
      ) {
        bytes += chunk.byteLength;
      }
      expect(bytes).toBe(0);
      expect(requested).toContain(`https://p.test/ipfs/${cid}?format=raw`);
    } finally {
      await helia.stop();
    }
  });
  /** Router answer listing one https trustless-gateway provider per host. */
  function providers(...hosts: string[]): Response {
    return json({
      Providers: hosts.map((host, i) => ({
        Schema: "peer",
        ID:
          [
            "12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTN",
            "12D3KooWDect8DhuEGwWRm3WmbwYE1dkEYsQw7JQAqobmoLWk4fr",
          ][i],
        Protocols: ["transport-ipfs-gateway-http"],
        Addrs: [`/dns4/${host}/tcp/443/https`],
      })),
    });
  }

  async function getBlock(
    helia: Awaited<ReturnType<typeof startHelia>>,
    cid: CID,
  ): Promise<number> {
    let bytes = 0;
    for await (
      const chunk of helia.blockstore.get(cid, {
        signal: AbortSignal.timeout(2000),
      })
    ) {
      bytes += chunk.byteLength;
    }
    return bytes;
  }

  function startHelia() {
    return createHeliaLight({
      blockstore: new MemoryBlockstore(),
      datastore: new MemoryDatastore(),
      ...delegatedRetrievalInit(["https://r1.test"]),
    })
      .start();
  }

  test("rejects a block whose bytes do not match the CID", async () => {
    const cid = CID.parse(EMPTY_CID);
    const requested: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      requested.push(url);
      if (url.startsWith("https://r1.test/routing/v1/providers/")) {
        return providers("p.test");
      }
      if (url === `https://p.test/ipfs/${cid}?format=raw`) {
        return new Response(new TextEncoder().encode("forged"));
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const helia = await startHelia();
    try {
      await expect(getBlock(helia, cid)).rejects.toThrow();
      expect(requested).toContain(`https://p.test/ipfs/${cid}?format=raw`);
      expect(await helia.blockstore.has(cid)).toBe(false);
    } finally {
      await helia.stop();
    }
  });

  test("falls back to the next provider when one fails", async () => {
    const cid = CID.parse(EMPTY_CID);
    const requested: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      requested.push(url);
      if (url.startsWith("https://r1.test/routing/v1/providers/")) {
        return providers("down.test", "up.test");
      }
      if (url === `https://down.test/ipfs/${cid}?format=raw`) {
        return new Response("error", { status: 500 });
      }
      if (url === `https://up.test/ipfs/${cid}?format=raw`) {
        return new Response(new Uint8Array(0));
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const helia = await startHelia();
    try {
      expect(await getBlock(helia, cid)).toBe(0);
      expect(requested).toContain(`https://down.test/ipfs/${cid}?format=raw`);
      expect(requested).toContain(`https://up.test/ipfs/${cid}?format=raw`);
    } finally {
      await helia.stop();
    }
  });
});
