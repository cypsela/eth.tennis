import type { Datastore } from "interface-datastore";
import { Key } from "interface-datastore";

import type { SiteMount } from "./types.js";

export interface SiteMountStoreOpts {
  key?: string;
}

export interface SiteMountStore {
  read(): Promise<SiteMount>;
  write(mount: SiteMount): Promise<void>;
  clear(): Promise<void>;
}

const DEFAULT_KEY = "/sitemount";

const EMPTY: SiteMount = { current: null, pending: null, lastChecked: 0 };

export function createSiteMountStore(
  datastore: Datastore,
  opts: SiteMountStoreOpts = {},
): SiteMountStore {
  const key = new Key(opts.key ?? DEFAULT_KEY);
  const dec = new TextDecoder();
  const enc = new TextEncoder();

  return {
    async read(): Promise<SiteMount> {
      try {
        const bytes = await datastore.get(key);
        const parsed = JSON.parse(dec.decode(bytes)) as SiteMount;
        return parsed;
      } catch {
        return { ...EMPTY };
      }
    },
    async write(mount: SiteMount): Promise<void> {
      await datastore.put(key, enc.encode(JSON.stringify(mount)));
    },
    async clear(): Promise<void> {
      try {
        await datastore.delete(key);
      } catch {
        // idempotent
      }
    },
  };
}
