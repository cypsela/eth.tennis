import { vi } from "vitest";

export type CapturedListener = {
  type: string;
  fn: EventListenerOrEventListenerObject;
  options?: AddEventListenerOptions | boolean;
};

export interface MockScope {
  scope: ServiceWorkerGlobalScope;
  listeners: CapturedListener[];
  postedFromClients: Array<{ clientId: string | null; data: unknown; }>;
  matchAllResult: Client[];
}

/** Build a fake ServiceWorkerGlobalScope sufficient for the absorber tests. */
export function makeMockScope(): MockScope {
  const listeners: CapturedListener[] = [];
  const postedFromClients: MockScope["postedFromClients"] = [];
  const matchAllResult: Client[] = [];

  const clients = {
    matchAll: vi.fn(async () => matchAllResult),
    claim: vi.fn(async () => undefined),
    get: vi.fn(async () => undefined),
  } as unknown as Clients;

  const registration = {
    scope: "https://x.eth.tennis/",
    active: null,
    waiting: null,
    installing: null,
    update: vi.fn(async () => undefined),
    unregister: vi.fn(async () => true),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as ServiceWorkerRegistration;

  const scope = {
    location: new URL("https://x.eth.tennis/"),
    clients,
    registration,
    caches: globalThis.caches ?? ({} as CacheStorage),
    skipWaiting: vi.fn(async () => undefined),
    addEventListener: vi.fn((type, fn, options) => {
      listeners.push({ type, fn, options });
    }),
    removeEventListener: vi.fn(),
    fetch: vi.fn(async () => new Response("real fetch")),
  } as unknown as ServiceWorkerGlobalScope;

  return { scope, listeners, postedFromClients, matchAllResult };
}

/** Build a minimal FetchEvent-like object whose respondWith we can observe. */
export function makeMockFetchEvent(
  req: Request,
): FetchEvent & { responded: () => Response | Promise<Response> | null; } {
  let resp: Response | Promise<Response> | null = null;
  const event = {
    request: req,
    clientId: "",
    resultingClientId: "",
    handled: Promise.resolve(),
    preloadResponse: Promise.resolve(undefined),
    waitUntil: vi.fn(),
    respondWith: vi.fn((r: Response | Promise<Response>) => {
      resp = r;
    }),
    responded: () => resp,
  };
  return event as unknown as FetchEvent & {
    responded: () => Response | Promise<Response> | null;
  };
}
