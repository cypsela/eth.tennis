/**
 * Maps a Helia onProgress event to a terminal line, or null if we do not
 * surface it. We retrieve blocks over HTTP from a trustless gateway and do not
 * run a libp2p/DHT node, so only the gateway block-fetch events are surfaced.
 */
export function progressEventToLine(
  type: string,
  detail: unknown,
): string | null {
  if (type === "trustless-gateway:get-block:fetch") {
    const host = hostOf(detail);
    return host ? `fetching from ${host}` : "fetching block";
  }
  return null;
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
