import type { Datastore } from "interface-datastore";
import { Key } from "interface-datastore";

import type {
  ContentReference,
  CurrentMount,
  SiteMount,
  SwState,
} from "./types.js";

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

function isContentRef(x: unknown): x is ContentReference {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return o["kind"] === "content"
    && typeof o["protocol"] === "string"
    && typeof o["value"] === "string";
}

function isSwState(x: unknown): x is SwState {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o["swUrl"] === "string"
    && typeof o["swInstalled"] === "boolean"
    && typeof o["swActivated"] === "boolean";
}

function isCurrentMount(x: unknown): x is CurrentMount {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return isContentRef(o["ref"]) && (o["sw"] === null || isSwState(o["sw"]));
}

function isSiteMount(x: unknown): x is SiteMount {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o["lastChecked"] !== "number") return false;
  if (o["current"] !== null && !isCurrentMount(o["current"])) return false;
  if (o["pending"] !== null && !isContentRef(o["pending"])) return false;
  return true;
}

export function createSiteMountStore(
  datastore: Datastore,
  opts: SiteMountStoreOpts = {},
): SiteMountStore {
  const key = new Key(opts.key ?? DEFAULT_KEY);
  const dec = new TextDecoder();
  const enc = new TextEncoder();

  return {
    async read(): Promise<SiteMount> {
      let bytes: Uint8Array;
      try {
        bytes = await datastore.get(key);
      } catch {
        return { ...EMPTY };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(dec.decode(bytes));
      } catch {
        return { ...EMPTY };
      }
      if (!isSiteMount(parsed)) {
        try {
          await datastore.delete(key);
        } catch {
          // best-effort: next read will re-validate-and-discard
        }
        return { ...EMPTY };
      }
      return parsed;
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
