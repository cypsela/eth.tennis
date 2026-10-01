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
  test("defaults to trustless-gateway.link with filebase as backup", async () => {
    const { DEFAULT_GATEWAYS } = await import("../src/helia.js");
    expect(DEFAULT_GATEWAYS).toEqual([
      "https://trustless-gateway.link",
      "https://ipfs.filebase.io",
    ]);
  });

  test("routes only through the gateways: no delegated routing", async () => {
    const { gatewayRetrievalInit } = await import("../src/helia.js");
    const init = gatewayRetrievalInit(["https://gw.example"]);
    expect(init.routers?.map((r) => (r as { name?: string; }).name)).toEqual([
      "http-gateway-router",
      "gateway-ipns-router",
    ]);
    expect(init.blockBrokers).toHaveLength(1);
    expect(init.libp2p).toEqual({ services: {} });
  });

  test("offers gateways as block providers in the configured order", async () => {
    const { gatewayRetrievalInit } = await import("../src/helia.js");
    const gateways = ["https://a.example", "https://b.example"];
    const [router] = (gatewayRetrievalInit(gateways).routers ?? []) as Array<
      Partial<import("@helia/interface").Routing>
    >;
    const hosts: string[] = [];
    for await (const p of router!.findProviders!(null as never)) {
      hosts.push(p.multiaddrs[0]!.toString());
    }
    expect(hosts).toEqual([
      "/dns/a.example/tcp/443/tls/http",
      "/dns/b.example/tcp/443/tls/http",
    ]);
  });
});
