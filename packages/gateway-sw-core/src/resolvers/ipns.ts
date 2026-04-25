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
    ): Promise<ContentReference<"ipfs">> {
      try {
        const key = CID.parse(ref.value) as ResolverKey;
        const resolved = await impl.resolve(key);
        return {
          kind: "content",
          protocol: "ipfs",
          value: resolved.cid.toString(),
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
