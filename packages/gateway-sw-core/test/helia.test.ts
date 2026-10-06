import { describe, expect, test } from "vitest";
import { deriveDbNames } from "../src/helia.js";

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

describe("gatewayRetrievalInit", () => {
  test("defaults to ipfs.filebase.io, shaped inside its rate limit", async () => {
    const { DEFAULT_GATEWAYS } = await import("../src/helia.js");
    expect(DEFAULT_GATEWAYS.map((g) => g.url)).toEqual([
      "https://ipfs.filebase.io",
    ]);
    // about 100 back to back, then a little under 2 per second
    expect(DEFAULT_GATEWAYS[0]!.burst).toBeLessThan(100);
    expect(DEFAULT_GATEWAYS[0]!.perSecond).toBeLessThan(2);
  });

  test("retrieves only through the gateways: no delegated routing", async () => {
    const { gatewayRetrievalInit } = await import("../src/helia.js");
    const init = gatewayRetrievalInit([{
      url: "https://gw.example",
      maxConcurrent: 4,
    }]);
    expect(init.blockBrokers.map((b) => (b as { name?: string; }).name))
      .toEqual(["gateway-block-broker"]);
    expect(init.routers.map((r) => (r as { name?: string; }).name)).toEqual([
      "gateway-ipns-router",
    ]);
  });

  test("a node built from the config fetches blocks from the gateway", async () => {
    const { createHeliaLight } = await import("helia");
    const { CID } = await import("multiformats/cid");
    const { gatewayRetrievalInit } = await import("../src/helia.js");
    // sha2-256 of zero bytes: a block we can serve and have verified
    const cid = CID.parse(
      "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
    );
    const requested: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      requested.push(url);
      return new Response(new Uint8Array(0), { status: 200 });
    }) as typeof fetch;
    const helia = await createHeliaLight(
      gatewayRetrievalInit([{ url: "https://gw.example", maxConcurrent: 4 }]),
    )
      .start();
    try {
      const got = await helia.blockstore.get(cid, {
        signal: AbortSignal.timeout(2000),
      }) as Uint8Array | AsyncIterable<Uint8Array>;
      if (!(got instanceof Uint8Array)) {
        for await (const _ of got) {
          /* drain */
        }
      }
      expect(requested).toEqual([`https://gw.example/ipfs/${cid}?format=raw`]);
    } finally {
      globalThis.fetch = realFetch;
      await helia.stop();
    }
  });
});
