import { createHeliaHTTP } from "@helia/http";
import type { Helia } from "@helia/interface";
import { IDBBlockstore } from "blockstore-idb";
import { IDBDatastore } from "datastore-idb";

export interface GatewayHeliaOpts {
  namespace?: string;
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
  // IDB stores require explicit open(); helia's start() only invokes
  // Startable.start()/stop(), which these don't implement.
  await blockstore.open();
  await datastore.open();
  return createHeliaHTTP({ blockstore, datastore });
}
