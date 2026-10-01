import type { Router, RoutingOptions } from "@helia/interface";
import { base36 } from "multiformats/bases/base36";
import { CID } from "multiformats/cid";
import * as Digest from "multiformats/hashes/digest";

const IPNS_PREFIX = new TextEncoder().encode("/ipns/");
const LIBP2P_KEY_CODEC = 0x72;
const IPNS_RECORD_TYPE = "application/vnd.ipfs.ipns-record";

export interface GatewayIpnsRoutingInit {
  /** Trustless gateway origins, tried in order. */
  gateways: readonly string[];
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
}

export type GatewayIpnsRouter = Router & Required<Pick<Router, "get">>;

function ipnsNameFromRoutingKey(key: Uint8Array): string {
  const hasPrefix = key.length > IPNS_PREFIX.length
    && IPNS_PREFIX.every((byte, i) => key[i] === byte);
  if (!hasPrefix) {
    throw new Error("gateway-ipns-router only resolves /ipns/ routing keys");
  }
  const digest = Digest.decode(key.subarray(IPNS_PREFIX.length));
  return CID.createV1(LIBP2P_KEY_CODEC, digest).toString(base36);
}

/**
 * Fetches signed IPNS records from trustless gateways
 * (`/ipns/{name}?format=ipns-record`). Records are returned unvalidated; the
 * IPNS resolver verifies the signature, so the gateways stay untrusted.
 */
export function gatewayIpnsRouting(
  init: GatewayIpnsRoutingInit,
): GatewayIpnsRouter {
  const doFetch = init.fetch ?? ((url, opts) => globalThis.fetch(url, opts));
  return {
    name: "gateway-ipns-router",
    async get(
      key: Uint8Array,
      options?: RoutingOptions,
    ): Promise<Uint8Array<ArrayBuffer>> {
      const name = ipnsNameFromRoutingKey(key);
      const errors: unknown[] = [];
      for (const gateway of init.gateways) {
        options?.signal?.throwIfAborted();
        const url = `${gateway}/ipns/${name}?format=ipns-record`;
        try {
          const res = await doFetch(url, {
            headers: { accept: IPNS_RECORD_TYPE },
            ...(options?.signal ? { signal: options.signal } : {}),
          });
          if (!res.ok) throw new Error(`${url} responded ${res.status}`);
          return new Uint8Array(await res.arrayBuffer());
        } catch (err) {
          errors.push(err);
        }
      }
      options?.signal?.throwIfAborted();
      throw new AggregateError(
        errors,
        `no gateway returned an IPNS record for ${name}`,
      );
    },
  };
}
