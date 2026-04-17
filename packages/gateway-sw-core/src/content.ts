import type { VerifiedFetch } from "@helia/verified-fetch";

import { ContentUnreachable, IpnsUnverifiable } from "./errors.js";
import type { Contenthash } from "./types.js";

export interface FetchArgs extends Contenthash {
  ensName: string;
  path: string;
}

export interface ContentFetcher {
  fetch(args: FetchArgs): Promise<Response>;
}

export async function createContentFetcher(): Promise<ContentFetcher> {
  const { createVerifiedFetch } = await import("@helia/verified-fetch");
  const impl = await createVerifiedFetch();
  return createContentFetcherFromImpl(impl);
}

export function createContentFetcherFromImpl(
  impl: VerifiedFetch,
): ContentFetcher {
  return {
    async fetch(args) {
      const normalizedPath = args.path.startsWith("/")
        ? args.path
        : `/${args.path}`;
      const url = `${args.protocol}://${args.cid}${normalizedPath}`;
      try {
        return await impl(url);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (
          args.protocol === "ipns" && /ipns|signature|expired/i.test(message)
        ) {
          throw new IpnsUnverifiable(args.ensName, args.cid);
        }
        throw new ContentUnreachable(args.ensName, args.cid);
      }
    },
  };
}
