import { NoHandler, ResolutionLoop } from "./errors.js";
import type {
  AddressReference,
  ContentReference,
  Handlers,
  Reference,
} from "./types.js";

export interface ResolveOpts {
  maxHops?: number;
  onHop?: (from: Reference, to: Reference) => void;
}

const DEFAULT_MAX_HOPS = 8;

export async function resolveReference(
  start: Reference,
  handlers: Handlers,
  opts: ResolveOpts = {},
): Promise<ContentReference> {
  const maxHops = opts.maxHops ?? DEFAULT_MAX_HOPS;
  let current: Reference = start;
  for (let hops = 0; hops < maxHops; hops++) {
    if (current.kind === "content") return current;
    const resolver = handlers.resolvers[current.protocol];
    if (!resolver) throw new NoHandler(current);
    const next = await resolver.resolve(current as AddressReference);
    opts.onHop?.(current, next);
    current = next;
  }
  if (current.kind === "content") return current;
  throw new ResolutionLoop(start, maxHops);
}

export async function fetchReference(
  start: Reference,
  path: string,
  handlers: Handlers,
  opts?: ResolveOpts,
): Promise<Response> {
  const terminal = await resolveReference(start, handlers, opts);
  const fetcher = handlers.fetchers[terminal.protocol];
  if (!fetcher) throw new NoHandler(terminal);
  return fetcher.fetch(terminal, path);
}
