import { trustlessGateway } from "@helia/block-brokers";
import { createHeliaHTTP, type HeliaHTTPInit } from "@helia/http";
import type { Helia } from "@helia/interface";
import { httpGatewayRouting } from "@helia/routers";
import { IDBBlockstore } from "blockstore-idb";
import { IDBDatastore } from "datastore-idb";
import { gatewayIpnsRouting } from "./routers/gateway-ipns.js";

export interface GatewayHeliaOpts {
  namespace?: string;
  /** Trustless gateway origins, tried in order. */
  gateways?: readonly string[];
}

const DEFAULT_NAMESPACE = "@cypsela/gateway-sw-core";

/** Primary first, backup second. */
export const DEFAULT_GATEWAYS: readonly string[] = [
  "https://trustless-gateway.link",
  "https://ipfs.filebase.io",
];

export function deriveDbNames(
  opts: Pick<GatewayHeliaOpts, "namespace"> = {},
): { blocks: string; data: string; } {
  const ns = opts.namespace ?? DEFAULT_NAMESPACE;
  return { blocks: `${ns}/blocks`, data: `${ns}/data` };
}

/**
 * Retrieval config: blocks and IPNS records both come from the configured
 * trustless gateways. No delegated routing, no DHT.
 */
export function gatewayRetrievalInit(
  gateways: readonly string[] = DEFAULT_GATEWAYS,
): Pick<HeliaHTTPInit, "blockBrokers" | "routers" | "libp2p"> {
  return {
    blockBrokers: [trustlessGateway()],
    routers: [
      httpGatewayRouting({ gateways: [...gateways], shuffle: false }),
      gatewayIpnsRouting({ gateways }),
    ],
    // Replaces @helia/http's default services, which include a delegated
    // routing client.
    libp2p: { services: {} },
  };
}

export async function createGatewayHelia(
  opts: GatewayHeliaOpts = {},
): Promise<Helia> {
  const { blocks, data } = deriveDbNames(opts);
  const blockstore = new IDBBlockstore(blocks);
  const datastore = new IDBDatastore(data);
  // IDB stores require explicit open(); helia's start() only invokes
  // Startable.start()/stop(), which these don't implement.
  await blockstore.open();
  await datastore.open();
  return createHeliaHTTP({
    blockstore,
    datastore,
    ...gatewayRetrievalInit(opts.gateways),
  });
}
