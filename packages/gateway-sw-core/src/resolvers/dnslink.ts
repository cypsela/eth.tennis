import { type DNSLink, dnsLink, type DNSLinkComponents } from "@helia/dnslink";

import { DnslinkRecordNotFound, DnslinkResolveFailed } from "../errors.js";
import type { AddressReference, Reference, Resolver } from "../types.js";

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
        if (cause instanceof Error && cause.name === "DNSLinkNotFoundError") {
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
            value: first.peerId.toString(),
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
