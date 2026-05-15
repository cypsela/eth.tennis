import type { ErrorClass } from "@cypsela/gateway-sw-core";

/**
 * Maps each ErrorClass surfaced by fetchReference to the HTTP status the
 * gateway returns to the page. Anything not here falls through to 500 via
 * the `unknown-error` row.
 *
 * 504 — the upstream (IPFS network) didn't answer in time.
 * 502 — the upstream answered, but with something unusable.
 * 501 — we don't know how to handle this contenthash protocol.
 * 508 — resolver loop detected.
 * 404 — content really isn't there.
 * 500 — anything else (bug or genuinely unknown).
 */
const STATUS: Record<ErrorClass, number> = {
  "sw-unsupported": 500,
  "sw-register-failed": 500,
  "sw-activation-timeout": 500,
  "contenthash-not-set": 404,
  "no-handler": 501,
  "resolution-loop": 508,
  "ipns-record-not-found": 502,
  "ipns-record-unverifiable": 502,
  "ipns-resolve-failed": 502,
  "ipns-address-unrecognized": 502,
  "dnslink-record-not-found": 502,
  "dnslink-resolve-failed": 502,
  "resolve-timeout": 504,
  "fetch-timeout": 504,
  "content-unreachable": 504,
  "ens-resolve-failed": 502,
  "unknown-error": 500,
};

/**
 * Build a Response from a thrown gateway error.
 *
 * Body is `<errorClass>: <message>`, matching the line format the bootstrap
 * terminal prints. The `x-gateway-error-class` header gives tooling a stable
 * machine-readable handle that doesn't depend on parsing the body.
 */
export function errorToResponse(err: unknown): Response {
  const errorClass: ErrorClass =
    (err as { errorClass?: ErrorClass; }).errorClass ?? "unknown-error";
  const detail = err instanceof Error ? err.message : String(err);
  return new Response(`${errorClass}: ${detail}`, {
    status: STATUS[errorClass],
    headers: {
      "content-type": "text/plain;charset=UTF-8",
      "x-gateway-error-class": errorClass,
    },
  });
}
