import { fallbackRouter } from "@helia/fallback-router";
import type { Helia, Router } from "@helia/interface";
import { trustlessGatewayBlockBroker } from "@helia/trustless-gateway-client";
import { IDBBlockstore } from "blockstore-idb";
import { IDBDatastore } from "datastore-idb";
import { createHeliaLight, type HeliaInit } from "helia";
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
 * Offers the gateways as providers for every CID, in the configured order.
 *
 * Wraps `fallbackRouter` without its "fallback" capability: helia 7.1 waits
 * forever in findProviders when every router is a fallback router, so the
 * gateways have to look like a default router.
 */
function gatewayProviderRouting(gateways: readonly string[]): Router {
  const inner = fallbackRouter({ gateways: [...gateways], shuffle: false });
  return {
    name: inner.name,
    findProviders: (cid, options) => inner.findProviders!(cid, options),
  };
}

/**
 * Retrieval config: blocks and IPNS records both come from the configured
 * trustless gateways. No delegated routing, no libp2p.
 */
export function gatewayRetrievalInit(
  gateways: readonly string[] = DEFAULT_GATEWAYS,
): Required<Pick<HeliaInit, "blockBrokers" | "routers">> {
  return {
    blockBrokers: [trustlessGatewayBlockBroker()],
    routers: [
      gatewayProviderRouting(gateways),
      gatewayIpnsRouting({ gateways }),
    ],
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
