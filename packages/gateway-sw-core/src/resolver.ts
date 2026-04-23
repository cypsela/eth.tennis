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

function shuffle<T>(arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = 0; i < copy.length; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

async function raceRecord<C>(
  clients: readonly C[],
  ensName: string,
  lookup: (
    c: C,
    name: string,
  ) => Promise<Awaited<ReturnType<typeof getContentHashRecord>>>,
): Promise<
  { record: Awaited<ReturnType<typeof getContentHashRecord>>; } | {
    errors: unknown[];
  }
> {
  try {
    const record = await Promise.any(clients.map((c) => lookup(c, ensName)));
    return { record };
  } catch (cause) {
    const errors = cause instanceof AggregateError ? cause.errors : [cause];
    return { errors };
  }
}

export function createResolver(opts: ResolverOpts): EnsResolver {
  const chain = addEnsContracts(mainnet);
  const clients = opts.rpcUrls.map((url) =>
    createPublicClient({
      chain,
      transport: http(url, { timeout: 8000, retryCount: 1 }),
    })
  );
  const lookup = (c: typeof clients[number], name: string) =>
    getContentHashRecord(c, { name });
  return {
    async resolve(ensName) {
      const shuffled = shuffle(clients);
      const batches = [
        shuffled.slice(0, RACE_COUNT),
        shuffled.slice(RACE_COUNT),
      ].filter((b) => b.length > 0);
      const errors: unknown[] = [];
      for (const batch of batches) {
        const result = await raceRecord(batch, ensName, lookup);
        if ("record" in result) return decodeRecord(ensName, result.record);
        errors.push(...result.errors);
      }
      const detail = errors.map((e) =>
        e instanceof Error ? e.message : String(e)
      ).join("; ");
      throw new RpcDown(
        ensName,
        new Error(`all ${errors.length} rpc(s) failed: ${detail}`),
      );
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
