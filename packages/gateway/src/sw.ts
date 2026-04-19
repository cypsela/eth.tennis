/// <reference lib="webworker" />
import {
  type ContentFetcher,
  install,
  type RenderErrorArgs,
} from "@cypsela/gateway-sw-core";

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE_VERSION = "bootstrap-v1";
const GATEWAY_DOMAIN = import.meta.env.VITE_GATEWAY_DOMAIN ?? "gateway.example";
const RPC_URL = import.meta.env.VITE_RPC_URL ?? "https://cloudflare-eth.com";
const TEST_CONTENT_GATEWAY = import.meta.env.VITE_TEST_CONTENT_GATEWAY;

const PRECACHE = ["/", "/index.html", "/src/styles.css"];

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

async function renderErrorResponse(_args: RenderErrorArgs): Promise<Response> {
  const cache = await caches.open(CACHE_VERSION);
  const shell = await cache.match("/index.html");
  if (!shell) {
    return new Response("bootstrap shell unavailable", {
      status: 500,
      headers: { "content-type": "text/plain" },
    });
  }
  return shell.clone();
}

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
  rpcUrl: RPC_URL,
  renderErrorResponse,
  ...(testContent ? { _content: testContent } : {}),
});
