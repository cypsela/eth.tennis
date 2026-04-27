/// <reference lib="webworker" />
import {
  installContentSw,
  PAGE_SHIM_HASH,
  PAGE_SHIM_SRC,
  rewriteHtmlForContentSw,
} from "@cypsela/gateway-content-sw";
import {
  ContentUnreachable,
  createGatewayHelia,
  createIpfsFetcher,
  createIpnsResolver,
  createRacingEnsResolver,
  createRankedEnsResolver,
  createSiteMountStore,
  type ErrorClass,
  fetchReference,
  formatRef,
  type Handlers,
  type SwState,
} from "@cypsela/gateway-sw-core";
import type { Helia } from "@helia/interface";

import { logErrorTree } from "./log-error.ts";
import { createMountPolicy, type MountPolicy } from "./mount-policy.ts";
import { createUpdateCheck, type UpdateCheck } from "./update-check.ts";

declare const __SHELL_ASSETS__: string[];
declare const __BYPASS_PREFIXES__: string[];

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE_VERSION = "bootstrap-v1";
const GATEWAY_DOMAIN: string = (() => {
  const v = import.meta.env.VITE_GATEWAY_DOMAIN;
  if (!v) throw new Error("VITE_GATEWAY_DOMAIN must be set");
  return v;
})();
const RPC_URLS = (import.meta.env.VITE_RPC_URLS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (RPC_URLS.length === 0) {
  throw new Error(
    "VITE_RPC_URLS must be set to a non-empty comma-separated list",
  );
}
const SHELL_ASSETS = __SHELL_ASSETS__;
const BYPASS_PREFIXES = __BYPASS_PREFIXES__;
const PRECACHE = ["/", ...SHELL_ASSETS];
const BYPASS_PATHS = new Set<string>(SHELL_ASSETS);

function isShellAsset(pathname: string): boolean {
  if (BYPASS_PATHS.has(pathname)) return true;
  return BYPASS_PREFIXES.some((p) => pathname.startsWith(p));
}

function extractEnsName(host: string): string | null {
  const suffix = `.${GATEWAY_DOMAIN}`;
  if (!host.endsWith(suffix)) return null;
  const bare = host.slice(0, -suffix.length);
  return bare ? `${bare}.eth` : null;
}

interface Runtime {
  helia: Helia;
  handlers: Handlers;
  bootstrapHandlers: Handlers;
  policy: MountPolicy;
  updateCheck: UpdateCheck;
  swStateCache: { value: SwState | null; };
}

let runtimeP: Promise<Runtime> | null = null;

async function createRuntime(): Promise<Runtime> {
  const helia = await createGatewayHelia({ namespace: GATEWAY_DOMAIN });
  const store = createSiteMountStore(helia.datastore);
  const policy = createMountPolicy({ store, helia });
  const ipns = createIpnsResolver(helia as never);
  const ipfs = await createIpfsFetcher({ helia });
  const handlers: Handlers = {
    resolvers: { ens: createRankedEnsResolver({ rpcUrls: RPC_URLS }), ipns },
    fetchers: { ipfs },
  };
  const bootstrapHandlers: Handlers = {
    resolvers: { ens: createRacingEnsResolver({ rpcUrls: RPC_URLS }), ipns },
    fetchers: { ipfs },
  };
  const updateCheck = createUpdateCheck({
    helia,
    handlers,
    policy,
    ttlMs: 5 * 60_000,
  });

  const swStateCache: { value: SwState | null; } = { value: null };
  try {
    const m = await policy.read();
    swStateCache.value = m.current?.sw ?? null;
  } catch {
    swStateCache.value = null;
  }

  try {
    const ensName = extractEnsName(sw.location.hostname);
    if (ensName) {
      const result = await policy.tryPromote({ clients: sw.clients, ensName });
      if (result) {
        const from = result.oldCurrent ? formatRef(result.oldCurrent) : "∅";
        console.info(
          `[gateway] promoted ${ensName}: ${from} → ${
            formatRef(result.newCurrent)
          }`,
        );
      }
    }
  } catch (err) {
    console.warn("[gateway] init: tryPromote failed", err);
  }

  return {
    helia,
    handlers,
    bootstrapHandlers,
    policy,
    updateCheck,
    swStateCache,
  };
}

async function getRuntime(): Promise<Runtime> {
  if (!runtimeP) {
    runtimeP = createRuntime();
  }
  return runtimeP;
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

sw.addEventListener("message", (event) => {
  const msg = event.data as unknown;
  if (
    !msg || typeof msg !== "object" || (msg as { type?: string; })
        .type !== "resolve-and-fetch"
  ) return;
  const { ensName } = msg as { ensName: string; path: string; };
  const source = event.source as Client | null;
  event.waitUntil((async () => {
    try {
      const { bootstrapHandlers, helia, policy } = await getRuntime();
      const { fetchRootThenDrain } = await import("./pinning.ts");
      const { resolveReference } = await import("@cypsela/gateway-sw-core");
      source?.postMessage({
        type: "log",
        source: "sw",
        level: "info",
        glyph: ">",
        text: `resolving ${ensName}`,
      });
      const start = {
        kind: "address" as const,
        protocol: "ens",
        value: ensName,
      };
      const onHop = (from: unknown, to: unknown) =>
        source?.postMessage({
          type: "log",
          source: "sw",
          level: "info",
          glyph: "↳",
          text: `${formatRef(from as never)} → ${formatRef(to as never)}`,
        });
      const fresh = await resolveReference(start, bootstrapHandlers, { onHop });
      source?.postMessage({
        type: "log",
        source: "sw",
        level: "info",
        glyph: ">",
        text: `fetching ${formatRef(fresh)}`,
      });
      const { CID } = await import("multiformats/cid");
      try {
        await fetchRootThenDrain(helia, CID.parse(fresh.value), {
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
      } catch (cause) {
        throw new ContentUnreachable(ensName, cause);
      }
      await policy.writeCurrent(fresh, { lastChecked: Date.now() });
      source?.postMessage({
        type: "log",
        source: "sw",
        level: "success",
        glyph: "✓",
        text: `mounted ${ensName}`,
      });
      source?.postMessage({ type: "done" });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const errorClass: ErrorClass = (err as { errorClass?: ErrorClass; })
        .errorClass ?? "unknown-error";
      logErrorTree(`[gateway] bootstrap failed for ${ensName}:`, err);
      source?.postMessage({
        type: "log",
        source: "sw",
        level: "error",
        glyph: "✗",
        text: `${errorClass}: ${detail}`,
      });
      source?.postMessage({
        type: "error",
        error: errorClass,
        details: detail,
      });
    }
  })());
});

void getRuntime().then((runtime) => {
  installContentSw({
    scope: sw,
    readSwState: () => runtime.swStateCache.value,
    writeSwState: async (state) => {
      runtime.swStateCache.value = state;
      await runtime.policy.writeSwState(state);
    },
    fetchSwScript: async (url) => {
      const mount = await runtime.policy.read();
      if (!mount.current) throw new Error("no current mount");
      const path = new URL(url, sw.location.origin).pathname;
      const resp = await fetchReference(
        mount.current.ref,
        path,
        runtime.handlers,
      );
      if (!resp.ok) {
        throw new Error(`fetchSwScript ${url} → ${resp.status}`);
      }
      return new Uint8Array(await resp.arrayBuffer());
    },
    defaultFetch: (event) => gatewayDefaultFetch(event, runtime),
  });
});

async function gatewayDefaultFetch(
  event: FetchEvent,
  runtime: Runtime,
): Promise<Response> {
  const url = new URL(event.request.url);

  if (url.origin !== sw.location.origin) {
    return fetch(event.request);
  }
  if (isShellAsset(url.pathname)) {
    const cache = await caches.open(CACHE_VERSION);
    const hit = await cache.match(url.pathname);
    if (hit) return hit.clone();
    return fetch(event.request);
  }

  const ensName = extractEnsName(url.hostname);
  if (!ensName) return fetch(event.request);

  const mount = await runtime.policy.read();
  if (!mount.current) {
    const cache = await caches.open(CACHE_VERSION);
    const shell = await cache.match("/");
    return shell?.clone() ?? fetch("/");
  }

  let response: Response;
  try {
    response = await fetchReference(
      mount.current.ref,
      url.pathname,
      runtime.handlers,
    );
  } catch (err) {
    console.error(err);
    return new Response(String(err), { status: 500 });
  }
  if (response.status === 412 || response.status === 504) {
    console.warn(
      `[gateway] block unreachable: ${
        formatRef(
          mount
            .current
            .ref,
        )
      }${url.pathname} (${response.status})`,
    );
  }
  if (event.request.mode === "navigate") {
    runtime.updateCheck.run(ensName).catch(() => {});
  }
  return rewriteHtmlForContentSw(response, {
    pageShimSrc: PAGE_SHIM_SRC,
    pageShimHash: PAGE_SHIM_HASH,
  });
}
