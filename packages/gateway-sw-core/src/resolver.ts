import { addEnsContracts } from "@ensdomains/ensjs";
import type { ClientWithEns } from "@ensdomains/ensjs/contracts";
import { getContentHashRecord } from "@ensdomains/ensjs/public";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

import {
  EnsNotFound,
  NoContenthash,
  RpcDown,
  UnsupportedProtocol,
} from "./errors.js";
import type { Contenthash, ResolverOpts } from "./types.js";

export interface EnsResolver {
  resolve(ensName: string): Promise<Contenthash>;
}

export function createResolver(opts: ResolverOpts): EnsResolver {
  const client = createPublicClient({
    chain: addEnsContracts(mainnet),
    transport: http(opts.rpcUrl),
  });
  return createResolverFromClient(client);
}

export function createResolverFromClient(client: ClientWithEns): EnsResolver {
  return {
    async resolve(ensName) {
      let record: Awaited<ReturnType<typeof getContentHashRecord>>;
      try {
        record = await getContentHashRecord(client, { name: ensName });
      } catch (cause) {
        throw new RpcDown(ensName, cause);
      }
      if (record == null) throw new EnsNotFound(ensName);

      const proto = record.protocolType;
      const cid = record.decoded;
      if (!cid) throw new NoContenthash(ensName);
      if (proto !== "ipfs" && proto !== "ipns") {
        throw new UnsupportedProtocol(ensName, String(proto));
      }
      return { protocol: proto, cid };
    },
  };
}
