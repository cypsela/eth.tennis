import { withBitswap } from "@helia/bitswap";
import { delegatedHTTPRouter } from "@helia/delegated-routing-client";
import type { Helia } from "@helia/interface";
import { type HeliaWithLibp2p, withLibp2pLight } from "@helia/libp2p";
import { trustlessGatewayBlockBroker } from "@helia/trustless-gateway-client";
import { type Identify, identify } from "@libp2p/identify";
import { noise } from "@libp2p/noise";
import { webSockets } from "@libp2p/websockets";
import { yamux } from "@libp2p/yamux";
import { IDBBlockstore } from "blockstore-idb";
import { IDBDatastore } from "datastore-idb";
import { createHeliaLight, type HeliaInit } from "helia";

export interface GatewayHeliaOpts {
  namespace?: string;
  /** Delegated Routing V1 HTTP endpoints, queried for providers and IPNS records. */
  routerUrls: readonly string[];
}

const DEFAULT_NAMESPACE = "@cypsela/gateway-sw-core";

/** Address types a browser can dial: https gateways and secure websockets. */
export const DEFAULT_FILTER_ADDRS: readonly string[] = ["https", "wss", "tls"];

/** Provider protocols a browser can fetch from. */
export const DEFAULT_FILTER_PROTOCOLS: readonly string[] = [
  "transport-bitswap",
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
 * routers, filtered to what a browser can reach. Blocks are fetched from the
 * https gateways those routers return; `withDelegatedNetworking` adds bitswap
 * for websocket providers.
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

/**
 * Adds a minimal browser libp2p node and bitswap to a helia node. It only
 * dials providers the routers return: no peer discovery, no listen addresses.
 * Bitswap never rejects for an unknown CID, so every fetch depends on a caller
 * signal (this is why the bootstrap root budget exists).
 */
export function withDelegatedNetworking<H extends Helia>(
  helia: H,
): HeliaWithLibp2p<{ identify: Identify; }> {
  return withBitswap(
    withLibp2pLight(helia, {
      transports: [webSockets()],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      services: { identify: identify() },
    }),
  );
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
  return withDelegatedNetworking(
    createHeliaLight({
      blockstore,
      datastore,
      ...delegatedRetrievalInit(opts.routerUrls),
    }),
  )
    .start();
}
