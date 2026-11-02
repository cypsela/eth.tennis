/**
 * Maps a Helia onProgress event to a terminal line, or null if we do not
 * surface it. Providers come from delegated routing and blocks are fetched
 * over HTTP from the trustless gateways they point to, so the lines show the
 * provider lookup, each provider found, and the endpoint being fetched from.
 * Per-block events are not surfaced; callers show each distinct line once.
 */
export function progressEventToLine(
  type: string,
  detail: unknown,
): string | null {
  switch (type) {
    case "helia:routing:find-providers:start":
      return "finding providers";
    case "trustless-gateway:found-provider": {
      const host = hostOf(detail);
      return host ? `provider ${host}` : null;
    }
    case "helia:block-brokers:query-provider:start": {
      const host = hostOf((detail as { provider?: unknown; } | null)?.provider);
      return host ? `fetching from ${host}` : null;
    }
    default:
      return null;
  }
}

function hostOf(detail: unknown): string | null {
  try {
    if (detail instanceof URL) return detail.host;
    if (typeof detail === "string") return new URL(detail).host;
    if (detail && typeof detail === "object" && "url" in detail) {
      const u = (detail as { url: unknown; }).url;
      if (u instanceof URL) return u.host;
      if (typeof u === "string") return new URL(u).host;
    }
  } catch { /* fall through */ }
  return null;
}
