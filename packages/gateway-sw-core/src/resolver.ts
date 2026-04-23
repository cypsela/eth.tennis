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

const RACE_COUNT = 3;

function pickRandom<T>(arr: readonly T[], n: number): T[] {
  if (arr.length <= n) return [...arr];
  const copy = [...arr];
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy.slice(0, n);
}

export function createResolver(opts: ResolverOpts): EnsResolver {
  const chain = addEnsContracts(mainnet);
  const clients = opts.rpcUrls.map((url) =>
    createPublicClient({
      chain,
      transport: http(url, { timeout: 5000, retryCount: 0 }),
    })
  );
  return {
    async resolve(ensName) {
      const picks = pickRandom(clients, RACE_COUNT);
      let record: Awaited<ReturnType<typeof getContentHashRecord>>;
      try {
        record = await Promise.any(
          picks.map((c) => getContentHashRecord(c, { name: ensName })),
        );
      } catch (cause) {
        if (cause instanceof AggregateError) {
          const detail = cause
            .errors
            .map((e) => e instanceof Error ? e.message : String(e))
            .join("; ");
          throw new RpcDown(
            ensName,
            new Error(`all ${cause.errors.length} rpc(s) failed: ${detail}`),
          );
        }
        throw new RpcDown(ensName, cause);
      }
      return decodeRecord(ensName, record);
    },
  };
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
      return decodeRecord(ensName, record);
    },
  };
}

function decodeRecord(
  ensName: string,
  record: Awaited<ReturnType<typeof getContentHashRecord>>,
): Contenthash {
  if (record == null) throw new EnsNotFound(ensName);
  const proto = record.protocolType;
  const cid = record.decoded;
  if (!cid) throw new NoContenthash(ensName);
  if (proto !== "ipfs" && proto !== "ipns") {
    throw new UnsupportedProtocol(ensName, String(proto));
  }
  return { protocol: proto, cid };
}
