/** Visual glyph shown at the start of a log line. */
export type Glyph = ">" | "↳" | "✓" | "⚠" | "✗";

/** Log severity. Maps to console.info/warn/error. */
export type LogLevel = "info" | "warn" | "error" | "success";

/** Source that emitted a log entry (attribution in the terminal). */
export type LogSource = "bootstrap" | "sw";

/** All failure classes surfaced by the gateway. */
export type ErrorClass =
  | "sw-unsupported"
  | "sw-register-failed"
  | "sw-activation-timeout"
  | "ens-not-found"
  | "no-contenthash"
  | "unsupported-protocol"
  | "content-unreachable"
  | "ipns-record-not-found"
  | "ipns-record-unverifiable"
  | "rpc-down";

/** Decoded contenthash record (ENSIP-7). */
export interface Contenthash {
  protocol: "ipfs" | "ipns";
  cid: string;
}

/** Options for building an ENS resolver. */
export interface ResolverOpts {
  rpcUrl: string;
}

/** Arguments passed to a custom error-response renderer. */
export interface RenderErrorArgs {
  /** Original request that failed. */
  request: Request;
  /** Resolved ENS name extracted from the hostname, or null if extraction failed. */
  ensName: string | null;
  /** The underlying error (GatewayError subclass or any thrown value). */
  error: unknown;
  /** Error class resolved from the error (falls back to "content-unreachable"). */
  errorClass: ErrorClass;
}

/** Options passed to the install() entry. */
export interface InstallOpts {
  /** Suffix that, when stripped from the hostname, yields the ENS name. */
  gatewayDomain: string;
  /** Ethereum RPC endpoint for ENS reads. */
  rpcUrl: string;
  /** TTL for the in-memory ENS contenthash cache. Defaults to 5 min. */
  ensTtlMs?: number;
  /**
   * Optional renderer for failed document fetches. Intended to return the
   * precached bootstrap shell so the page cold-starts and retries live. If
   * omitted, the library returns a plain-text Response with the right status.
   */
  renderErrorResponse?: (args: RenderErrorArgs) => Response | Promise<Response>;
}

/** Message bootstrap → SW. */
export type BootstrapToSw = {
  type: "resolve-and-fetch";
  ensName: string;
  path: string;
};

/** Message SW → bootstrap. */
export type SwToBootstrap =
  | { type: "log"; source: "sw"; level: LogLevel; text: string; glyph?: Glyph; }
  | { type: "done"; }
  | { type: "error"; error: ErrorClass; details?: unknown; };
