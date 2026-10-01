import { type DNSLink, dnsLink, type DNSLinkComponents } from "@helia/dnslink";
import { base36 } from "multiformats/bases/base36";
import { CID } from "multiformats/cid";

import { DnslinkRecordNotFound, DnslinkResolveFailed } from "../errors.js";
import type { AddressReference, Reference, Resolver } from "../types.js";

const LIBP2P_KEY_CODEC = 0x72;

/**
 * A missing record surfaces either as DNSLinkNotFoundError or, when every DNS
 * resolver answered with no records (NXDOMAIN included), as a
 * DNSQueryFailedError made up solely of EmptyDNSAnswerErrors.
 */
function isRecordNotFound(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  if (cause.name === "DNSLinkNotFoundError") return true;
  return cause.name === "DNSQueryFailedError"
    && cause instanceof AggregateError
    && cause.errors.length > 0
    && cause.errors.every((e) =>
      e instanceof Error && e.name === "EmptyDNSAnswerError"
    );
}

export function createDnslinkResolver(
  components: DNSLinkComponents,
): Resolver<"dnslink"> {
  return createDnslinkResolverFromImpl(dnsLink(components));
}

export function createDnslinkResolverFromImpl(
  impl: DNSLink,
): Resolver<"dnslink"> {
  return {
    protocol: "dnslink",
    async resolve(
      ref: AddressReference<"dnslink">,
      opts?: { signal?: AbortSignal; },
    ): Promise<Reference> {
      const domain = ref.value;
      let results;
      try {
        results = opts?.signal
          ? await impl.resolve(domain, { signal: opts.signal })
          : await impl.resolve(domain);
      } catch (cause) {
        if (isRecordNotFound(cause)) {
          throw new DnslinkRecordNotFound(domain, domain, cause);
        }
        throw new DnslinkResolveFailed(domain, domain, cause);
      }
      if (results.length === 0) {
        throw new DnslinkRecordNotFound(domain, domain);
      }
      const first = results.find((r) => r.namespace === "ipfs") ?? results[0]!;
      if (first.path != null && first.path !== "") {
        console.warn(
          `[gateway] dnslink path component dropped (todo): `
            + `${domain} → ${first.path}`,
        );
      }
      switch (first.namespace) {
        case "ipfs":
          return {
            kind: "content",
            protocol: "ipfs",
            value: first.cid.toString(),
          };
        case "ipns":
          return {
            kind: "address",
            protocol: "ipns",
            value: CID
              .createV1(LIBP2P_KEY_CODEC, first.value)
              .toString(base36),
          };
        default:
          throw new DnslinkResolveFailed(
            domain,
            domain,
            new Error(`unexpected namespace: ${
              (first as { namespace: string; }).namespace
            }`),
          );
      }
    },
  };
}
