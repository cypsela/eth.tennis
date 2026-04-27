export interface FetchShimOpts {
  origin: string;
  sameOriginFetch: (req: Request) => Promise<Response>;
  realFetch: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
}

export function createFetchShim(opts: FetchShimOpts): typeof fetch {
  const { origin, sameOriginFetch, realFetch } = opts;
  return async function shimmedFetch(input, init) {
    const req = input instanceof Request
      ? new Request(input, init)
      : new Request(typeof input === "string" ? input : input.toString(), init);
    const url = new URL(req.url);
    if (url.origin === origin) {
      return sameOriginFetch(req);
    }
    return realFetch(req);
  };
}
