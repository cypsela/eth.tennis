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

/** Arguments passed to a bootstrap-shell renderer. */
export interface RenderShellArgs {
  /** Original navigation request. */
  request: Request;
  /** Resolved ENS name extracted from the hostname, or null if extraction failed. */
  ensName: string | null;
  /** The underlying error, if the shell is being served as a fallback for a failed fetch. */
  error?: unknown;
  /** Error class resolved from the error, if any (falls back to "content-unreachable"). */
  errorClass?: ErrorClass;
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
   * Optional renderer that returns the precached bootstrap shell. Used on
   * fresh-entry navigations with a cache miss and as a fallback when an
   * in-site navigation's resolve+fetch fails. If omitted, the library
   * returns a plain-text Response with the right status.
   */
  renderBootstrapShell?: (
    args: RenderShellArgs,
  ) => Response | Promise<Response>;
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
