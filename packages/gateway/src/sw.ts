/// <reference lib="webworker" />
import {
  type GatewayState,
  httpStatusFor,
  install,
  type RenderErrorArgs,
} from "@cypsela/gateway-sw-core";
import { injectState } from "./sw-helpers.ts";

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE_VERSION = "bootstrap-v1";
const GATEWAY_DOMAIN = import.meta.env.VITE_GATEWAY_DOMAIN ?? "gateway.example";
const RPC_URL = import.meta.env.VITE_RPC_URL ?? "https://cloudflare-eth.com";

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

async function renderErrorResponse(args: RenderErrorArgs): Promise<Response> {
  const cache = await caches.open(CACHE_VERSION);
  const shell = await cache.match("/index.html");
  const status = httpStatusFor(args.errorClass);
  const state: GatewayState = {
    error: args.errorClass,
    ensName: args.ensName ?? "",
    details: args.error instanceof Error
      ? args.error.message
      : String(args.error),
    timestamp: Date.now(),
  };
  if (!shell) {
    return new Response(JSON.stringify(state), {
      status,
      headers: { "content-type": "application/json" },
    });
  }
  const html = await shell.text();
  return new Response(injectState(html, state), {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

install(sw, {
  gatewayDomain: GATEWAY_DOMAIN,
  rpcUrl: RPC_URL,
  renderErrorResponse,
});
