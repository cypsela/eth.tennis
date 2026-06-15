const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** True for the HTTP redirect statuses the gateway forwards to the browser. */
export function isRedirectStatus(status: number): boolean {
  return REDIRECT_STATUSES.has(status);
}

/**
 * verified-fetch resolves a site's `_redirects` rules against the
 * `ipfs://<cid>/...` URL the gateway hands it, so a 3xx `Location` points at
 * `ipfs://<cid>/<target>`. Rewrite that to the same path on the gateway
 * `origin` so the browser navigates within the site and any query the rule
 * added survives into the URL bar. Absolute non-ipfs/ipns targets (external
 * redirects) are passed through untouched; relative targets resolve against
 * the origin.
 */
export function toSameOriginRedirect(
  response: Response,
  origin: string,
): Response {
  const location = response.headers.get("location");
  if (location == null) return response;

  let target: string;
  try {
    const u = new URL(location);
    target = u.protocol === "ipfs:" || u.protocol === "ipns:"
      ? `${origin}${u.pathname}${u.search}${u.hash}`
      : location;
  } catch {
    // relative Location: resolve against the gateway origin
    target = new URL(location, origin).toString();
  }

  return new Response(null, {
    status: response.status,
    headers: { location: target },
  });
}
