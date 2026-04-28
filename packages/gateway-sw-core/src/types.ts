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
  | "contenthash-not-set"
  | "no-handler"
  | "resolution-loop"
  | "ipns-record-not-found"
  | "ipns-record-unverifiable"
  | "ipns-resolve-failed"
  | "ipns-address-unrecognized"
  | "dnslink-record-not-found"
  | "dnslink-resolve-failed"
  | "resolve-timeout"
  | "fetch-timeout"
  | "content-unreachable"
  | "ens-resolve-failed"
  | "unknown-error";

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
  resolve(
    ref: AddressReference<P>,
    options?: { signal?: AbortSignal; },
  ): Promise<Reference>;
}

/** Fetches a subresource under a content reference. */
export interface ContentFetcher<P extends string = string> {
  readonly protocol: P;
  fetch(
    ref: ContentReference<P>,
    path: string,
    options?: { signal?: AbortSignal; },
  ): Promise<Response>;
}

/** Registry of handlers keyed by protocol string. */
export interface Handlers {
  resolvers: Record<string, Resolver>;
  fetchers: Record<string, ContentFetcher>;
}

/** Persisted SW lifecycle state for a content service worker. */
export type SwState = {
  swUrl: string;
  swInstalled: boolean;
  swActivated: boolean;
};

/**
 * Currently-served mount: a content reference plus optional content-SW state.
 * Nesting `sw` under `current` makes "SW state without content" unrepresentable.
 */
export type CurrentMount = { ref: ContentReference; sw: SwState | null; };

/** Two-slot site mount: serving `current`, staging `pending`. */
export type SiteMount = {
  current: CurrentMount | null;
  pending: ContentReference | null;
  lastChecked: number;
};
