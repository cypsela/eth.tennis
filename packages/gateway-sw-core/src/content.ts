import type { IPNSResolver } from "@helia/ipns";
import type { VerifiedFetch } from "@helia/verified-fetch";
import { CID } from "multiformats/cid";

import {
  ContentUnreachable,
  IpnsRecordNotFound,
  IpnsRecordUnverifiable,
} from "./errors.js";
import type { Contenthash } from "./types.js";

export interface FetchArgs extends Contenthash {
  ensName: string;
  path: string;
}

export interface ContentFetcher {
  fetch(args: FetchArgs): Promise<Response>;
}

export async function createContentFetcher(): Promise<ContentFetcher> {
  const [{ createHelia }, { ipnsResolver }, { createVerifiedFetchWithHelia }] =
    await Promise.all([
      import("helia"),
      import("@helia/ipns"),
      import("@helia/verified-fetch"),
    ]);
  const helia = await createHelia();
  const resolver = ipnsResolver(helia);
  const impl = await createVerifiedFetchWithHelia(helia, {
    ipnsResolver: resolver,
  });
  return createContentFetcherFromImpl(impl, resolver);
}

type ResolverKey = Parameters<IPNSResolver["resolve"]>[0];

export function createContentFetcherFromImpl(
  impl: VerifiedFetch,
  resolver: IPNSResolver,
): ContentFetcher {
  return {
    async fetch(args) {
      const requestPath = args.path.startsWith("/")
        ? args.path
        : `/${args.path}`;

      if (args.protocol === "ipns") {
        let resolved;
        try {
          const key = CID.parse(args.cid) as ResolverKey;
          resolved = await resolver.resolve(key);
        } catch (cause) {
          if (cause instanceof Error && cause.name === "RecordNotFoundError") {
            throw new IpnsRecordNotFound(args.ensName, args.cid, cause);
          }
          if (
            cause instanceof Error
            && cause.name === "RecordsFailedValidationError"
          ) {
            throw new IpnsRecordUnverifiable(args.ensName, args.cid, cause);
          }
          throw new ContentUnreachable(args.ensName, args.cid, cause);
        }
        const resolvedPath = resolved.path
          ? resolved.path.startsWith("/") ? resolved.path : `/${resolved.path}`
          : "";
        const ipfsUrl =
          `ipfs://${resolved.cid.toString()}${resolvedPath}${requestPath}`;
        try {
          return await impl(ipfsUrl);
        } catch (cause) {
          throw new ContentUnreachable(
            args.ensName,
            resolved.cid.toString(),
            cause,
          );
        }
      }

      const url = `ipfs://${args.cid}${requestPath}`;
      try {
        return await impl(url);
      } catch (cause) {
        throw new ContentUnreachable(args.ensName, args.cid, cause);
      }
    },
  };
}
