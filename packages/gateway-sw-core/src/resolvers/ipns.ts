import { type IPNSResolver, ipnsResolver } from "@helia/ipns";
import { CID } from "multiformats/cid";

import {
  IpnsRecordNotFound,
  IpnsRecordUnverifiable,
  IpnsResolveFailed,
} from "../errors.js";
import type { AddressReference, ContentReference, Resolver } from "../types.js";

export interface IpnsResolverComponents {
  routing: unknown;
}

export function createIpnsResolver(
  components: IpnsResolverComponents,
): Resolver<"ipns"> {
  const impl = ipnsResolver(components as never);
  return createIpnsResolverFromImpl(impl);
}

type ResolverKey = Parameters<IPNSResolver["resolve"]>[0];

export function createIpnsResolverFromImpl(
  impl: IPNSResolver,
): Resolver<"ipns"> {
  return {
    protocol: "ipns",
    async resolve(
      ref: AddressReference<"ipns">,
      opts?: { signal?: AbortSignal; },
    ): Promise<ContentReference<"ipfs">> {
      try {
        const key = CID.parse(ref.value) as ResolverKey;
        // Recursive records yield one result per hop; the last is the target.
        let target: string | undefined;
        for await (
          const { value } of opts?.signal
            ? impl.resolve(key, { signal: opts.signal })
            : impl.resolve(key)
        ) {
          target = value;
        }
        const cid = target?.match(/^\/ipfs\/([^/]+)/)?.[1];
        if (cid == null) {
          throw new Error(`record does not point at /ipfs/: ${target}`);
        }
        return {
          kind: "content",
          protocol: "ipfs",
          value: CID.parse(cid).toString(),
        };
      } catch (cause) {
        if (cause instanceof Error && cause.name === "RecordNotFoundError") {
          throw new IpnsRecordNotFound(ref.value, ref.value, cause);
        }
        if (
          cause instanceof Error
          && cause.name === "RecordsFailedValidationError"
        ) {
          throw new IpnsRecordUnverifiable(ref.value, ref.value, cause);
        }
        throw new IpnsResolveFailed(ref.value, ref.value, cause);
      }
    },
  };
}
