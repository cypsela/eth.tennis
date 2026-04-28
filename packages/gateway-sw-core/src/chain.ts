import {
  FetchTimeout,
  NoHandler,
  ResolutionLoop,
  ResolveTimeout,
} from "./errors.js";
import type {
  AddressReference,
  ContentReference,
  Handlers,
  Reference,
} from "./types.js";

export interface ResolveOpts {
  maxHops?: number;
  onHop?: (from: Reference, to: Reference) => void;
  resolveStepMs?: number;
  fetchTimeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_MAX_HOPS = 8;

function composeSignals(
  caller: AbortSignal | undefined,
  step: AbortSignal | undefined,
): AbortSignal | undefined {
  if (!step) return caller;
  if (!caller) return step;
  return AbortSignal.any([caller, step]);
}

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

    const stepSignal = opts.resolveStepMs != null
      ? AbortSignal.timeout(opts.resolveStepMs)
      : undefined;
    const signal = composeSignals(opts.signal, stepSignal);

    let next: Reference;
    try {
      next = signal
        ? await resolver.resolve(current as AddressReference, { signal })
        : await resolver.resolve(current as AddressReference);
    } catch (cause) {
      if (stepSignal?.aborted && !opts.signal?.aborted) {
        throw new ResolveTimeout(current, opts.resolveStepMs!);
      }
      throw cause;
    }
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

  const fetchSig = opts?.fetchTimeoutMs != null
    ? AbortSignal.timeout(opts.fetchTimeoutMs)
    : undefined;
  const signal = composeSignals(opts?.signal, fetchSig);

  try {
    return signal
      ? await fetcher.fetch(terminal, path, { signal })
      : await fetcher.fetch(terminal, path);
  } catch (cause) {
    if (fetchSig?.aborted && !opts?.signal?.aborted) {
      throw new FetchTimeout(terminal, opts!.fetchTimeoutMs!);
    }
    throw cause;
  }
}
