import type { Helia } from "@helia/interface";
import type { VerifiedFetch } from "@helia/verified-fetch";

import type { ContentFetcher, ContentReference } from "../types.js";

export interface IpfsFetcherOpts {
  helia: Helia;
}

export async function createIpfsFetcher(
  opts: IpfsFetcherOpts,
): Promise<ContentFetcher<"ipfs">> {
  const { createVerifiedFetchWithHelia } = await import(
    "@helia/verified-fetch"
  );
  const impl = await createVerifiedFetchWithHelia(opts.helia);
  return createIpfsFetcherFromImpl(impl);
}

export function createIpfsFetcherFromImpl(
  impl: VerifiedFetch,
): ContentFetcher<"ipfs"> {
  return {
    protocol: "ipfs",
    async fetch(
      ref: ContentReference<"ipfs">,
      path: string,
      opts?: { signal?: AbortSignal; },
    ): Promise<Response> {
      const p = path.startsWith("/") ? path : `/${path}`;
      const url = `ipfs://${ref.value}${p}`;
      return opts?.signal ? impl(url, { signal: opts.signal }) : impl(url);
    },
  };
}
