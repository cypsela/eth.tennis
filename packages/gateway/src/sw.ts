/// <reference lib="webworker" />
import { type ContentFetcher, install } from "@cypsela/gateway-sw-core";

declare const __SHELL_ASSETS__: string[];
declare const __BYPASS_PREFIXES__: string[];

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE_VERSION = "bootstrap-v1";
const GATEWAY_DOMAIN = import.meta.env.VITE_GATEWAY_DOMAIN ?? "gateway.example";
const RPC_URLS = (import.meta.env.VITE_RPC_URLS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (RPC_URLS.length === 0) {
  throw new Error(
    "VITE_RPC_URLS must be set to a non-empty comma-separated list",
  );
}
const TEST_CONTENT_GATEWAY = import.meta.env.VITE_TEST_CONTENT_GATEWAY;

const SHELL_ASSETS = __SHELL_ASSETS__;
const BYPASS_PREFIXES = __BYPASS_PREFIXES__;
const PRECACHE = ["/", ...SHELL_ASSETS];
const BYPASS_PATHS = new Set<string>(SHELL_ASSETS);

function shouldBypass(pathname: string): boolean {
  if (BYPASS_PATHS.has(pathname)) return true;
  return BYPASS_PREFIXES.some((p) => pathname.startsWith(p));
}

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE)),
  );
  sw.skipWaiting();
});

sw.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((n) => n.startsWith("bootstrap-") && n !== CACHE_VERSION)
        .map((n) => caches.delete(n)),
    );
    await sw
      .clients
      .claim();
  })());
});

sw.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") return;
  const url = new URL(event.request.url);
  if (url.origin !== sw.location.origin) return;
  if (!shouldBypass(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const hit = await cache.match(url.pathname);
    return hit?.clone() ?? fetch(event.request);
  })());
});

const testContent: ContentFetcher | undefined = TEST_CONTENT_GATEWAY
  ? {
    async fetch(args) {
      const path = args.path.startsWith("/") ? args.path : `/${args.path}`;
      return fetch(`${TEST_CONTENT_GATEWAY}/ipfs/${args.cid}${path}`);
    },
  }
  : undefined;

install(sw, {
  gatewayDomain: GATEWAY_DOMAIN,
  rpcUrls: RPC_URLS,
  ...(testContent ? { _content: testContent } : {}),
});
