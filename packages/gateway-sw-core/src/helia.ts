import { IDBBlockstore } from "blockstore-idb";
import { IDBDatastore } from "datastore-idb";
import type { Helia } from "helia";

export interface GatewayHeliaOpts {
  namespace?: string;
  libp2p?: unknown;
}

const DEFAULT_NAMESPACE = "@cypsela/gateway-sw-core";

export function deriveDbNames(
  opts: Pick<GatewayHeliaOpts, "namespace"> = {},
): { blocks: string; data: string; } {
  const ns = opts.namespace ?? DEFAULT_NAMESPACE;
  return { blocks: `${ns}/blocks`, data: `${ns}/data` };
}

export async function createGatewayHelia(
  opts: GatewayHeliaOpts = {},
): Promise<Helia> {
  const { blocks, data } = deriveDbNames(opts);
  const blockstore = new IDBBlockstore(blocks);
  const datastore = new IDBDatastore(data);
  await blockstore.open();
  await datastore.open();
  const { createHelia } = await import("helia");
  return createHelia({
    blockstore,
    datastore,
    ...(opts.libp2p ? { libp2p: opts.libp2p as never } : {}),
  });
}
