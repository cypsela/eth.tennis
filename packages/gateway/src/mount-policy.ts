import type {
  ContentReference,
  SiteMount,
  SiteMountStore,
} from "@cypsela/gateway-sw-core";
import type { Helia } from "helia";
import { CID } from "multiformats/cid";

export interface MountPolicyOpts {
  store: SiteMountStore;
  helia: Pick<Helia, "pins">;
}

export interface TryPromoteArgs {
  clients: Pick<ServiceWorkerGlobalScope["clients"], "matchAll">;
  ensName: string;
}

export interface WriteCurrentOpts {
  lastChecked?: number;
}

export interface MountPolicy {
  read(): Promise<SiteMount>;
  writeCurrent(ref: ContentReference, opts?: WriteCurrentOpts): Promise<void>;
  writePending(ref: ContentReference): Promise<void>;
  clearPending(): Promise<void>;
  clearMount(): Promise<void>;
  tryPromote(
    args: TryPromoteArgs,
  ): Promise<
    | { oldCurrent: ContentReference | null; newCurrent: ContentReference; }
    | null
  >;
}

export function createMountPolicy(opts: MountPolicyOpts): MountPolicy {
  const { store, helia } = opts;

  async function read(): Promise<SiteMount> {
    return store.read();
  }

  async function writeCurrent(
    ref: ContentReference,
    writeOpts?: WriteCurrentOpts,
  ): Promise<void> {
    const prev = await store.read();
    await store.write({
      current: { ref, sw: null },
      pending: null,
      lastChecked: writeOpts?.lastChecked ?? prev.lastChecked,
    });
  }

  async function writePending(ref: ContentReference): Promise<void> {
    const prev = await store.read();
    if (!prev.current) {
      throw new Error(
        "mount-policy: current must be set before writing pending",
      );
    }
    await store.write({
      current: prev.current,
      pending: ref,
      lastChecked: prev.lastChecked,
    });
  }

  async function clearPending(): Promise<void> {
    const prev = await store.read();
    await store.write({ ...prev, pending: null });
  }

  async function tryPromote(
    args: TryPromoteArgs,
  ): Promise<
    | { oldCurrent: ContentReference | null; newCurrent: ContentReference; }
    | null
  > {
    const prev = await store.read();
    if (!prev.pending) return null;
    const windows = await args.clients.matchAll({ type: "window" });
    if (windows.length > 0) return null;
    const oldCurrent = prev.current?.ref ?? null;
    const newCurrent = prev.pending;
    await store.write({
      current: { ref: newCurrent, sw: null },
      pending: null,
      lastChecked: prev.lastChecked,
    });
    if (oldCurrent) {
      try {
        await helia.pins.rm(CID.parse(oldCurrent.value));
      } catch {
        // best-effort GC
      }
    }
    return { oldCurrent, newCurrent };
  }

  return {
    read,
    writeCurrent,
    writePending,
    clearPending,
    clearMount: () => store.clear(),
    tryPromote,
  };
}
