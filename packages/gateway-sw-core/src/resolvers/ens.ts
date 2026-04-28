import { addEnsContracts } from "@ensdomains/ensjs";
import type { ClientWithEns } from "@ensdomains/ensjs/contracts";
import { getContentHashRecord } from "@ensdomains/ensjs/public";
import { CID } from "multiformats/cid";
import { createPublicClient, fallback, http } from "viem";
import { mainnet } from "viem/chains";

import {
  ContentHashNotSet,
  EnsResolveFailed,
  IpnsAddressUnrecognized,
} from "../errors.js";
import type { AddressReference, Reference, Resolver } from "../types.js";

export interface EnsResolverOpts {
  rpcUrls: string[];
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

export function createRankedEnsResolver(
  opts: EnsResolverOpts,
): Resolver<"ens"> {
  const chain = addEnsContracts(mainnet);
  const transports = opts.rpcUrls.map((url) =>
    http(url, { timeout: 4000, retryCount: 1 })
  );
  const client = createPublicClient({
    chain,
    transport: fallback(transports, { rank: true }),
  });
  return createEnsResolverFromClient(client);
}

function decodeRecord(
  ensName: string,
  record: Awaited<ReturnType<typeof getContentHashRecord>>,
): Reference {
  if (record == null) throw new ContentHashNotSet(ensName);
  const proto = record.protocolType;
  const value = record.decoded;
  if (!value) throw new EnsResolveFailed(ensName);
  if (proto === "ipfs") {
    return { kind: "content", protocol: "ipfs", value };
  }
  if (proto === "ipns") {
    if (isCid(value)) return { kind: "address", protocol: "ipns", value };
    if (looksLikeDomain(value)) {
      return { kind: "address", protocol: "dnslink", value };
    }
    throw new IpnsAddressUnrecognized(ensName, value);
  }
  return { kind: "address", protocol: String(proto), value };
}

function isCid(s: string): boolean {
  try {
    CID.parse(s);
    return true;
  } catch {
    return false;
  }
}

export function looksLikeDomain(s: string): boolean {
  if (s.length < 1 || s.length > 253) return false;
  const labels = s.split(".");
  if (labels.length < 2) return false;
  const labelRe = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
  for (const label of labels) {
    if (label.length < 1 || label.length > 63) return false;
    if (!labelRe.test(label)) return false;
  }
  return true;
}
