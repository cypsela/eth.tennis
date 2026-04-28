import type { Helia } from "@helia/interface";
import type { CID } from "multiformats/cid";

export interface PinHooks {
  onSuccess?: () => void;
  onFailure?: (err: unknown) => void;
}

export async function fetchRootThenDrain(
  helia: Pick<Helia, "pins">,
  cid: CID,
  hooks?: PinHooks,
): Promise<void> {
  let iter: AsyncGenerator<CID>;
  try {
    iter = helia.pins.add(cid);
    await iter.next();
  } catch (err) {
    if (err instanceof Error && err.name === "AlreadyPinnedError") {
      hooks?.onSuccess?.();
      return;
    }
    throw err;
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

export function createEnsurePinned(helia: Pick<Helia, "pins">): EnsurePinned {
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
      onSuccess: () => {
        completed.add(k);
        inflight.delete(k);
        for (const h of allHooks) h.onSuccess?.();
      },
      onFailure: (err) => {
        inflight.delete(k);
        for (const h of allHooks) h.onFailure?.(err);
      },
    })
      .catch((err) => {
        inflight.delete(k);
        throw err;
      });
    inflight.set(k, { promise, hooks: allHooks });
    return promise;
  };
}
