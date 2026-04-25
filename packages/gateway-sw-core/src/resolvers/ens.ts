import { addEnsContracts } from "@ensdomains/ensjs";
import type { ClientWithEns } from "@ensdomains/ensjs/contracts";
import { getContentHashRecord } from "@ensdomains/ensjs/public";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

import {
  EnsNotFound,
  EnsResolveFailed,
  NoContenthash,
  UnsupportedProtocol,
} from "../errors.js";
import type { AddressReference, Reference, Resolver } from "../types.js";

export interface EnsResolverOpts {
  rpcUrls: string[];
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

export function createEnsResolver(opts: EnsResolverOpts): Resolver<"ens"> {
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
    protocol: "ens",
    async resolve(ref: AddressReference<"ens">): Promise<Reference> {
      const shuffled = shuffle(clients);
      const batches = [
        shuffled.slice(0, RACE_COUNT),
        shuffled.slice(RACE_COUNT),
      ]
        .filter((b) => b.length > 0);
      const errors: unknown[] = [];
      for (const batch of batches) {
        const result = await raceRecord(batch, ref.value, lookup);
        if ("record" in result) return decodeRecord(ref.value, result.record);
        errors.push(...result.errors);
      }
      const detail = errors
        .map((e) => e instanceof Error ? e.message : String(e))
        .join("; ");
      throw new EnsResolveFailed(
        ref.value,
        new Error(`all ${errors.length} rpc(s) failed: ${detail}`),
      );
    },
  };
}

type EnsRecord = Awaited<ReturnType<typeof getContentHashRecord>>;

async function lookupAndDecode(
  ensName: string,
  lookup: () => Promise<EnsRecord>,
): Promise<Reference> {
  let record: EnsRecord;
  try {
    record = await lookup();
  } catch (cause) {
    throw new EnsResolveFailed(ensName, cause);
  }
  return decodeRecord(ensName, record);
}

export function createEnsResolverFromClient(
  client: ClientWithEns,
): Resolver<"ens"> {
  return {
    protocol: "ens",
    async resolve(ref: AddressReference<"ens">): Promise<Reference> {
      return lookupAndDecode(ref.value, () =>
        getContentHashRecord(client, { name: ref.value }));
    },
  };
}

export function createRacingEnsResolver(
  opts: EnsResolverOpts,
): Resolver<"ens"> {
  const chain = addEnsContracts(mainnet);
  const clients = opts.rpcUrls.map((url) =>
    createPublicClient({
      chain,
      transport: http(url, { timeout: 4000, retryCount: 1 }),
    })
  );
  return {
    protocol: "ens",
    async resolve(ref: AddressReference<"ens">): Promise<Reference> {
      return lookupAndDecode(ref.value, () =>
        Promise
          .any(clients
            .map((c) => getContentHashRecord(c, { name: ref.value }))));
    },
  };
}

function decodeRecord(
  ensName: string,
  record: Awaited<ReturnType<typeof getContentHashRecord>>,
): Reference {
  if (record == null) throw new EnsNotFound(ensName);
  const proto = record.protocolType;
  const value = record.decoded;
  if (!value) throw new NoContenthash(ensName);
  if (proto === "ipfs") {
    return { kind: "content", protocol: "ipfs", value };
  }
  if (proto === "ipns") {
    return { kind: "address", protocol: "ipns", value };
  }
  throw new UnsupportedProtocol(ensName, String(proto));
}
