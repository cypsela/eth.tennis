import type { Helia } from "helia";
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
