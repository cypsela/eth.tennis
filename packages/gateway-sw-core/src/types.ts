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
  /** RPC endpoints. Resolution races a random subset in parallel. */
  rpcUrls: string[];
}

/** Options passed to the install() entry. */
export interface InstallOpts {
  /** Suffix that, when stripped from the hostname, yields the ENS name. */
  gatewayDomain: string;
  /** Ethereum RPC endpoints. Resolution races a random subset in parallel. */
  rpcUrls: string[];
  /** TTL for the in-memory ENS contenthash cache. Defaults to 5 min. */
  ensTtlMs?: number;
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

/** Unresolved reference — e.g. an ENS name or IPNS key. */
export interface AddressReference<P extends string = string> {
  readonly kind: "address";
  readonly protocol: P;
  readonly value: string;
}

/** Content-addressed reference — e.g. an IPFS CID. */
export interface ContentReference<P extends string = string> {
  readonly kind: "content";
  readonly protocol: P;
  readonly value: string;
}

/** Discriminated union over both reference kinds. */
export type Reference = AddressReference | ContentReference;

/** Resolves an address reference one hop closer to a content reference. */
export interface Resolver<P extends string = string> {
  readonly protocol: P;
  resolve(ref: AddressReference<P>): Promise<Reference>;
}

/** Fetches a subresource under a content reference. */
export interface ContentFetcher<P extends string = string> {
  readonly protocol: P;
  fetch(ref: ContentReference<P>, path: string): Promise<Response>;
}

/** Registry of handlers keyed by protocol string. */
export interface Handlers {
  resolvers: Record<string, Resolver>;
  fetchers: Record<string, ContentFetcher>;
}

/** Two-slot site mount: serving `current`, staging `pending`. */
export type SiteMount = {
  current: ContentReference | null;
  pending: ContentReference | null;
  lastChecked: number;
};
