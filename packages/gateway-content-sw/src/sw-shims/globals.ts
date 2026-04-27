import { createClientsShim } from "./self-clients.js";
import { createFetchShim } from "./self-fetch.js";
import { createRegistrationShim } from "./self-registration.js";

export interface SwGlobalsInput {
  scope: ServiceWorkerGlobalScope;
  swUrl: string;
  /** For same-origin requests during absorbed SW runtime. */
  sameOriginFetch: (req: Request) => Promise<Response>;
  /** Original `self.fetch` saved before any patching. */
  realFetch: typeof fetch;
}

export interface SwGlobals {
  fetch: typeof fetch;
  clients: Clients;
  registration: ServiceWorkerRegistration;
  caches: CacheStorage;
}

export function createSwGlobals(input: SwGlobalsInput): SwGlobals {
  return {
    fetch: createFetchShim({
      origin: input
        .scope
        .location
        .origin,
      sameOriginFetch: input.sameOriginFetch,
      realFetch: input.realFetch,
    }),
    clients: createClientsShim(input.scope),
    registration: createRegistrationShim(input.scope, { swUrl: input.swUrl }),
    caches: input.scope.caches,
  };
}
