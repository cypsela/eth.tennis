import {
  type ContentReference,
  createSwrCache,
  formatHop,
  formatRef,
  type Handlers,
  type Reference,
  resolveReference,
} from "@cypsela/gateway-sw-core";
import type { Helia } from "@helia/interface";
import { CID } from "multiformats/cid";

import { logErrorTree } from "./log-error.ts";
import type { MountPolicy } from "./mount-policy.ts";
import { fetchRootThenDrain } from "./pinning.ts";

export interface UpdateCheckOpts {
  helia: Pick<Helia, "pins">;
  handlers: Handlers;
  policy: MountPolicy;
  ttlMs: number;
  now?: () => number;
}

export interface UpdateCheck {
  run(ensName: string): Promise<ContentReference>;
}

export function createUpdateCheck(opts: UpdateCheckOpts): UpdateCheck {
  const cache = createSwrCache<string, ContentReference>({
    ttlMs: opts.ttlMs,
    ...(opts.now ? { now: opts.now } : {}),
  });

  async function runCheck(ensName: string): Promise<ContentReference> {
    const start: Reference = {
      kind: "address",
      protocol: "ens",
      value: ensName,
    };
    const onHop = (from: Reference, to: Reference) =>
      console.info(`[gateway] ${ensName}: ${formatHop(from, to)}`);
    let fresh: Reference;
    try {
      fresh = await resolveReference(start, opts.handlers, { onHop });
    } catch (err) {
      logErrorTree(`[gateway] update-check failed for ${ensName}:`, err);
      throw err;
    }

    const mount = await opts.policy.read();
    const latest = mount.pending ?? mount.current?.ref ?? null;
    if (latest && fresh.value === latest.value) return fresh;

    console.info(`[gateway] ${ensName}: fetching ${formatRef(fresh)}`);
    try {
      await fetchRootThenDrain(opts.helia as Helia, CID.parse(fresh.value), {
        onSuccess: () =>
          console.info(
            `[gateway] ${ensName} fully pinned (${formatRef(fresh)})`,
          ),
        onFailure: (err) =>
          console.warn(
            `[gateway] pin walk did not complete for ${ensName}`,
            err,
          ),
      });
    } catch (err) {
      console.warn(`[gateway] root fetch failed for ${ensName}`, err);
      return fresh;
    }
    await opts.policy.writePending(fresh);
    console.info(
      `[gateway] update ready for ${ensName}. `
        + `Close all tabs to apply. (pending=${formatRef(fresh)})`,
    );
    return fresh;
  }

  return {
    run: (ensName) => cache.getOrLoad(ensName, () => runCheck(ensName)),
  };
}
