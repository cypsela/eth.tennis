import type { Helia } from "@helia/interface";
import { IDBBlockstore } from "blockstore-idb";
import { IDBDatastore } from "datastore-idb";
import { createHeliaLight, type HeliaInit } from "helia";
import {
  gatewayBlockBroker,
  type GatewayConfig,
} from "./retrieval/gateway-block-broker.js";
import { gatewayIpnsRouting } from "./routers/gateway-ipns.js";

export interface GatewayHeliaOpts {
  namespace?: string;
  /** Trustless gateways in preference order: the first is the primary. */
  gateways?: readonly GatewayConfig[];
}

const DEFAULT_NAMESPACE = "@cypsela/gateway-sw-core";

/**
 * ipfs.filebase.io rate limits by request count: it serves about 100 requests
 * back to back, then refills at a little under 2 per second, and answers
 * anything beyond that with 429 (measured 2026-10-01). The limits stay inside
 * that envelope.
 */
export const DEFAULT_GATEWAYS: readonly GatewayConfig[] = [{
  url: "https://ipfs.filebase.io",
  maxConcurrent: 16,
  burst: 80,
  perSecond: 1.5,
}];

export function deriveDbNames(
  opts: Pick<GatewayHeliaOpts, "namespace"> = {},
): { blocks: string; data: string; } {
  const ns = opts.namespace ?? DEFAULT_NAMESPACE;
  return { blocks: `${ns}/blocks`, data: `${ns}/data` };
}

/**
 * Retrieval config: blocks and IPNS records both come from the configured
 * trustless gateways. No delegated routing, no libp2p.
 */
export function gatewayRetrievalInit(
  gateways: readonly GatewayConfig[] = DEFAULT_GATEWAYS,
): Required<Pick<HeliaInit, "blockBrokers" | "routers">> {
  return {
    blockBrokers: [gatewayBlockBroker({ gateways })],
    routers: [gatewayIpnsRouting({ gateways: gateways.map((g) => g.url) })],
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
  return createHeliaLight({
    blockstore,
    datastore,
    ...gatewayRetrievalInit(opts.gateways),
  })
    .start();
}
