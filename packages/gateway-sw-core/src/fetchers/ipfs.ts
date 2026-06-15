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
      opts?: { signal?: AbortSignal; redirect?: "follow" | "manual"; },
    ): Promise<Response> {
      const p = path.startsWith("/") ? path : `/${path}`;
      const url = `ipfs://${ref.value}${p}`;
      const init: { signal?: AbortSignal; redirect?: "follow" | "manual"; } =
        {};
      if (opts?.signal) init.signal = opts.signal;
      if (opts?.redirect) init.redirect = opts.redirect;
      return Object.keys(init).length > 0 ? impl(url, init) : impl(url);
    },
  };
}
