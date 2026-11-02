import { delegatedHTTPRouter } from "@helia/delegated-routing-client";
import type { Helia } from "@helia/interface";
import { trustlessGatewayBlockBroker } from "@helia/trustless-gateway-client";
import { IDBBlockstore } from "blockstore-idb";
import { IDBDatastore } from "datastore-idb";
import { createHeliaLight, type HeliaInit } from "helia";

export interface GatewayHeliaOpts {
  namespace?: string;
  /** Delegated Routing V1 HTTP endpoints, queried for providers and IPNS records. */
  routerUrls: readonly string[];
}

const DEFAULT_NAMESPACE = "@cypsela/gateway-sw-core";

/**
 * Router address filter: keep only providers with an https multiaddr, since
 * the SW fetches blocks over HTTP.
 */
export const DEFAULT_FILTER_ADDRS: readonly string[] = ["https"];

/** Provider protocols a browser can fetch from. */
export const DEFAULT_FILTER_PROTOCOLS: readonly string[] = [
  "transport-ipfs-gateway-http",
  "unknown",
];

export function deriveDbNames(
  opts: Pick<GatewayHeliaOpts, "namespace"> = {},
): { blocks: string; data: string; } {
  const ns = opts.namespace ?? DEFAULT_NAMESPACE;
  return { blocks: `${ns}/blocks`, data: `${ns}/data` };
}

/**
 * Retrieval config: providers and IPNS records come from the delegated
 * routers, filtered to https providers. Blocks are fetched over HTTP from the
 * trustless gateways those providers run. No libp2p.
 */
export function delegatedRetrievalInit(
  routerUrls: readonly string[],
): Required<Pick<HeliaInit, "blockBrokers" | "routers">> {
  if (routerUrls.length === 0) {
    throw new Error("at least one delegated router URL is required");
  }
  return {
    blockBrokers: [trustlessGatewayBlockBroker()],
    routers: routerUrls.map((url) =>
      delegatedHTTPRouter({
        url,
        filterAddrs: [...DEFAULT_FILTER_ADDRS],
        filterProtocols: [...DEFAULT_FILTER_PROTOCOLS],
        // Do not store router answers (including negative ones) in the SW's
        // Cache Storage.
        cacheTTL: 0,
      })
    ),
  };
}

export async function createGatewayHelia(
  opts: GatewayHeliaOpts,
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
    ...delegatedRetrievalInit(opts.routerUrls),
  })
    .start();
}
