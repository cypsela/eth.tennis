import type { Helia } from "@helia/interface";
import { breadthFirstWalker } from "@helia/utils";
import type { CID } from "multiformats/cid";

export interface PinHooks {
  onSuccess?: () => void;
  onFailure?: (err: unknown) => void;
  onProgress?: (evt: { type: string; detail: unknown; }) => void;
}

export interface PinOptions {
  /** Aborts the pin if the root block has not arrived in this many ms. */
  rootTimeoutMs?: number;
}

export async function fetchRootThenDrain(
  helia: Pick<Helia, "pins" | "blockstore">,
  cid: CID,
  hooks?: PinHooks,
  opts?: PinOptions,
): Promise<void> {
  // Breadth-first so the directory structure and the first block of every
  // file are cached before any one file's deep blocks.
  const controller = new AbortController();
  const timer = opts?.rootTimeoutMs != null
    ? setTimeout(
      () =>
        controller.abort(
          new Error(`root block not fetched in ${opts.rootTimeoutMs}ms`),
        ),
      opts.rootTimeoutMs,
    )
    : undefined;
  // Walk through a session for the root: providers are looked up once for the
  // root and reused for every child block. Without it each block outside a
  // session costs its own router lookup. Fetched blocks still land in the
  // local blockstore, so the pin is recorded as usual.
  const session = helia.blockstore.createSession(cid, {
    signal: controller.signal,
  });
  const addOpts = {
    signal: controller.signal,
    walker: (
      components: Parameters<ReturnType<typeof breadthFirstWalker>>[0],
    ) => breadthFirstWalker()({ ...components, blockstore: session }),
    ...(hooks?.onProgress
      ? {
        onProgress: (evt: unknown) =>
          hooks.onProgress!(evt as { type: string; detail: unknown; }),
      }
      : {}),
  };
  let iter: AsyncGenerator<CID>;
  try {
    iter = helia.pins.add(cid, addOpts);
    await iter.next();
  } catch (err) {
    if (err instanceof Error && err.name === "AlreadyPinnedError") {
      hooks?.onSuccess?.();
      return;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  void (async () => {
    try {
      for await (const _ of iter) { /* drain */ }
      hooks?.onSuccess?.();
    } catch (err) {
      hooks?.onFailure?.(err);
    }
  })();
}

export type EnsurePinned = (cid: CID, hooks?: PinHooks) => Promise<void>;

export function createEnsurePinned(
  helia: Pick<Helia, "pins" | "blockstore">,
  opts?: PinOptions,
): EnsurePinned {
  const inflight = new Map<
    string,
    { promise: Promise<void>; hooks: PinHooks[]; }
  >();
  const completed = new Set<string>();
  return (cid, hooks) => {
    const k = cid.toString();
    if (completed.has(k)) {
      hooks?.onSuccess?.();
      return Promise.resolve();
    }
    const existing = inflight.get(k);
    if (existing) {
      if (hooks) existing.hooks.push(hooks);
      return existing.promise;
    }
    const allHooks: PinHooks[] = hooks ? [hooks] : [];
    const promise = fetchRootThenDrain(helia, cid, {
      onProgress: (evt) => {
        for (const h of allHooks) h.onProgress?.(evt);
      },
      onSuccess: () => {
        completed.add(k);
        inflight.delete(k);
        for (const h of allHooks) h.onSuccess?.();
      },
      onFailure: (err) => {
        inflight.delete(k);
        for (const h of allHooks) h.onFailure?.(err);
      },
    }, opts)
      .catch((err) => {
        inflight.delete(k);
        throw err;
      });
    inflight.set(k, { promise, hooks: allHooks });
    return promise;
  };
}
