import type {
  BlockBroker,
  BlockRetrievalOptions,
  SessionBlockBroker,
} from "@helia/interface";
import { base64 } from "multiformats/bases/base64";
import type { CID } from "multiformats/cid";
import {
  createGatewayLimiter,
  type GatewayLimiter,
  type GatewayLimits,
} from "./limiter.js";

const RAW_BLOCK_TYPE = "application/vnd.ipld.raw";
const DEFAULT_MAX_BLOCK_SIZE = 2_097_152;
const DEFAULT_HEDGE_AFTER_MS = 4_000;
const MIN_ATTEMPTS = 3;
const RETRY_PAUSE_MS = 500;

export interface GatewayConfig extends GatewayLimits {
  /** Trustless gateway origin, e.g. `https://trustless-gateway.link`. */
  url: string;
}

export interface GatewayBlockBrokerInit {
  /** Gateways in preference order: the first is the primary. */
  gateways: readonly GatewayConfig[];
  /**
   * How long a gateway may take over a block before the next gateway is asked
   * as well. The slow request keeps running; the first answer wins.
   */
  hedgeAfterMs?: number;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
}

interface Gateway {
  url: string;
  limiter: GatewayLimiter;
}

interface Inflight {
  promise: Promise<Uint8Array>;
  controller: AbortController;
  waiting: number;
}

/**
 * Fetches raw blocks from trustless gateways, one gateway per block.
 *
 * Each gateway has its own limiter, so requests stay inside what that gateway
 * tolerates. A block goes to the primary unless the primary is saturated and a
 * later gateway can take it immediately. If a gateway fails, the next one is
 * tried, cycling until the block has had three tries; if it is merely slow, a
 * different gateway is asked as well and the first answer wins. Blocks are checked with `validateFn`, so gateways stay untrusted.
 */
export function gatewayBlockBroker(init: GatewayBlockBrokerInit): BlockBroker {
  const doFetch = init.fetch ?? ((url, opts) => globalThis.fetch(url, opts));
  const gateways: Gateway[] = init.gateways.map((g) => ({
    url: g.url,
    limiter: createGatewayLimiter(g),
  }));
  const hedgeAfterMs = init.hedgeAfterMs ?? DEFAULT_HEDGE_AFTER_MS;
  const inflight = new Map<string, Inflight>();

  function attemptOrder(): Gateway[] {
    const [primary, ...rest] = gateways;
    if (primary == null || primary.limiter.hasCapacity()) return gateways;
    const spare = rest.find((g) => g.limiter.hasCapacity());
    if (spare == null) return gateways;
    return [spare, ...gateways.filter((g) => g !== spare)];
  }

  async function fetchRaw(
    gateway: Gateway,
    cid: CID,
    options: BlockRetrievalOptions,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    const url = `${gateway.url}/ipfs/${cid.toString()}?format=raw`;
    const maxSize = options.maxSize ?? DEFAULT_MAX_BLOCK_SIZE;
    options.onProgress?.(
      new CustomEvent("trustless-gateway:get-block:fetch", {
        detail: new URL(url),
      }),
    );
    const res = await doFetch(url, {
      signal,
      headers: { accept: RAW_BLOCK_TYPE },
      referrerPolicy: "no-referrer",
      credentials: "omit",
    });
    if (!res.ok) throw new Error(`${url} responded ${res.status}`);
    if (Number(res.headers.get("content-length") ?? 0) > maxSize) {
      throw new Error(`${url} exceeds the ${maxSize} byte block limit`);
    }
    const block = new Uint8Array(await res.arrayBuffer());
    if (block.byteLength > maxSize) {
      throw new Error(`${url} exceeds the ${maxSize} byte block limit`);
    }
    await options.validateFn?.(block);
    return block;
  }

  function fetchFromGateways(
    cid: CID,
    options: BlockRetrievalOptions,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    // Cycle through the gateways until every block has had MIN_ATTEMPTS
    // tries, so a lone gateway gets retried instead of failing on one error.
    const once = attemptOrder();
    const order = [...once];
    while (order.length < MIN_ATTEMPTS) order.push(...once);
    order.length = Math.max(once.length, MIN_ATTEMPTS);
    // Aborts every attempt once one wins or the caller gives up.
    const attempts = new AbortController();
    const attemptSignal = AbortSignal.any([signal, attempts.signal]);
    return new Promise<Uint8Array>((resolve, reject) => {
      const errors: unknown[] = [];
      let next = 0;
      let running = 0;
      let hedge: ReturnType<typeof setTimeout> | undefined;

      const finish = (settle: () => void): void => {
        clearTimeout(hedge);
        attempts.abort();
        settle();
      };

      const startNext = (): void => {
        clearTimeout(hedge);
        const gateway = order[next++];
        if (gateway == null) return;
        running += 1;
        gateway
          .limiter
          .run(() => {
            // The hedge clock starts when the request is sent, not while it
            // waits in the limiter. Only gateways not yet tried are hedged to.
            if (next < once.length) hedge = setTimeout(startNext, hedgeAfterMs);
            return fetchRaw(gateway, cid, options, attemptSignal);
          }, attemptSignal)
          .then((block) => finish(() => resolve(block)), (err) => {
            running -= 1;
            if (signal.aborted) return finish(() => reject(err));
            errors.push(err);
            if (next < order.length) {
              // Pause before going back to a gateway that has already failed.
              const repeat = next >= once.length;
              if (!repeat) return startNext();
              // Another attempt is still in flight: let it finish first.
              if (running > 0) return;
              clearTimeout(hedge);
              hedge = setTimeout(
                startNext,
                RETRY_PAUSE_MS * (next - once.length + 1),
              );
              return;
            }
            if (running === 0) {
              finish(() =>
                reject(
                  new AggregateError(
                    errors,
                    `no gateway returned block ${cid}`,
                  ),
                )
              );
            }
          });
      };
      startNext();
    });
  }

  // Concurrent requests for one block share a single fetch, which is only
  // aborted once every caller has given up.
  async function retrieve(
    cid: CID,
    options: BlockRetrievalOptions = {},
  ): Promise<Uint8Array> {
    options.signal?.throwIfAborted();
    const key = base64.encode(cid.multihash.bytes);
    let entry = inflight.get(key);
    if (entry == null) {
      const controller = new AbortController();
      const promise = fetchFromGateways(cid, options, controller.signal)
        .finally(() => inflight.delete(key));
      promise.catch(() => {});
      entry = { promise, controller, waiting: 0 };
      inflight.set(key, entry);
    }
    const shared = entry;
    const signal = options.signal;
    if (signal == null) return shared.promise;

    shared.waiting += 1;
    return new Promise<Uint8Array>((resolve, reject) => {
      const onAbort = (): void => {
        shared.waiting -= 1;
        if (shared.waiting === 0) shared.controller.abort(signal.reason);
        reject(signal.reason);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      shared.promise.then(resolve, reject).finally(() =>
        signal.removeEventListener("abort", onAbort)
      );
    });
  }

  const name = "gateway-block-broker";
  return {
    name,
    retrieve,
    createSession(): SessionBlockBroker {
      return { name, retrieve, addPeer: async () => {} };
    },
  };
}
