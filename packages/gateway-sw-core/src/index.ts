export const VERSION = "0.0.0";
export * from "./cache.js";
export * from "./content.js";
export * from "./errors.js";
export * from "./log.js";
export * from "./resolver.js";
export * from "./types.js";

import { createSwrCache } from "./cache.js";
import { type ContentFetcher, createContentFetcher } from "./content.js";
import { ContentUnreachable, GatewayError, httpStatusFor } from "./errors.js";
import { createResolver, type EnsResolver } from "./resolver.js";
import type {
  BootstrapToSw,
  Contenthash,
  Glyph,
  InstallOpts,
  LogLevel,
  SwToBootstrap,
} from "./types.js";

interface InternalOpts extends InstallOpts {
  _resolver?: EnsResolver;
  _content?: ContentFetcher;
}

const CONTENT_SW_WARNING =
  "eth.tennis detected a SW registration from this ENS site.\n"
  + "If your SW does network-fallbacks, your site may break on this gateway.\n"
  + "Import @cypsela/gateway-sw-core in your SW to retain gateway resolution.";

export function install(
  scope: ServiceWorkerGlobalScope,
  opts: InternalOpts,
): void {
  const resolver = opts._resolver ?? createResolver({ rpcUrl: opts.rpcUrl });
  let contentPromise: Promise<ContentFetcher> | null = null;
  const getContent = () =>
    opts._content
      ? Promise.resolve(opts._content)
      : (contentPromise ??= createContentFetcher());

  const ensCache = createSwrCache<string, Contenthash>({
    ttlMs: opts.ensTtlMs ?? 5 * 60 * 1000,
  });
  const contentCache = new Map<string, Response>();

  const extractEnsName = (host: string): string | null => {
    const suffix = `.${opts.gatewayDomain}`;
    return host.endsWith(suffix) ? host.slice(0, -suffix.length) : null;
  };

  scope.addEventListener("message", async (event: ExtendableMessageEvent) => {
    const msg = event.data as BootstrapToSw;
    if (msg?.type !== "resolve-and-fetch") return;
    const source = event.source as Client | null;
    const post = (m: SwToBootstrap) => source?.postMessage(m);
    const log = (level: LogLevel, glyph: Glyph, text: string) =>
      post({ type: "log", source: "sw", level, text, glyph });

    try {
      log("info", ">", `resolving ENS: ${msg.ensName}`);
      const ch = await ensCache.getOrLoad(
        msg.ensName,
        () => resolver.resolve(msg.ensName),
      );
      log("success", "✓", `contenthash: ${ch.protocol}://${ch.cid}`);

      log("info", ">", "fetching content via helia");
      const fetcher = await getContent();
      const response = await fetcher.fetch({
        ensName: msg.ensName,
        protocol: ch.protocol,
        cid: ch.cid,
        path: msg.path,
      });
      if (!response.ok) {
        throw new ContentUnreachable(
          msg.ensName,
          ch.cid,
          new Error(`HTTP ${response.status}`),
        );
      }
      const cacheKey = `${msg.ensName}${msg.path}`;
      contentCache.set(cacheKey, response.clone());
      log("success", "✓", "done");
      post({ type: "done" });
    } catch (err) {
      const errClass = err instanceof GatewayError
        ? err.errorClass
        : "content-unreachable";
      const detail = err instanceof Error ? err.message : String(err);
      log("error", "✗", `${errClass}: ${detail}`);
      post({ type: "error", error: errClass, details: detail });
    }
  });

  const renderShell = (
    request: Request,
    ensName: string | null,
    err?: unknown,
  ): Response | Promise<Response> => {
    if (opts.renderBootstrapShell) {
      if (err === undefined) {
        return opts.renderBootstrapShell({ request, ensName });
      }
      const errorClass = err instanceof GatewayError
        ? err.errorClass
        : "content-unreachable";
      return opts.renderBootstrapShell({
        request,
        ensName,
        error: err,
        errorClass,
      });
    }
    const status = err instanceof GatewayError
      ? httpStatusFor(err.errorClass)
      : err !== undefined
      ? 500
      : 200;
    return new Response(err !== undefined ? String(err) : "", { status });
  };

  const resolveAndFetch = async (
    ensName: string,
    pathname: string,
  ): Promise<Response> => {
    const ch = await ensCache.getOrLoad(
      ensName,
      () => resolver.resolve(ensName),
    );
    const fetcher = await getContent();
    const res = await fetcher.fetch({
      ensName,
      protocol: ch.protocol,
      cid: ch.cid,
      path: pathname,
    });
    if (!res.ok) {
      throw new ContentUnreachable(
        ensName,
        ch.cid,
        new Error(`HTTP ${res.status}`),
      );
    }
    return res;
  };

  scope.addEventListener("fetch", (event: FetchEvent) => {
    if ((event.request.destination as string) === "serviceworker") {
      console.warn(CONTENT_SW_WARNING);
      void (async () => {
        const clients = await scope.clients.matchAll({
          includeUncontrolled: true,
        });
        for (const client of clients) {
          client.postMessage(
            {
              type: "log",
              source: "sw",
              level: "warn",
              glyph: "⚠",
              text: CONTENT_SW_WARNING,
            } satisfies SwToBootstrap,
          );
        }
      })();
      return;
    }

    const url = new URL(event.request.url);
    const ensName = extractEnsName(url.hostname);
    if (!ensName) return;
    const cacheKey = `${ensName}${url.pathname}`;
    const cached = contentCache.get(cacheKey);
    if (cached) {
      event.respondWith(cached.clone());
      return;
    }

    if (event.request.mode === "navigate") {
      const site = event.request.headers.get("sec-fetch-site");
      const inSite = site === "same-origin" || site === "same-site";
      if (!inSite) {
        event.respondWith(Promise.resolve(renderShell(event.request, ensName)));
        return;
      }
      event.respondWith((async () => {
        try {
          const res = await resolveAndFetch(ensName, url.pathname);
          contentCache.set(cacheKey, res.clone());
          return res;
        } catch (err) {
          return renderShell(event.request, ensName, err);
        }
      })());
      return;
    }

    event.respondWith((async () => {
      try {
        const ch = await ensCache.getOrLoad(
          ensName,
          () => resolver.resolve(ensName),
        );
        const fetcher = await getContent();
        const res = await fetcher.fetch({
          ensName,
          protocol: ch.protocol,
          cid: ch.cid,
          path: url.pathname,
        });
        if (res.ok) {
          contentCache.set(cacheKey, res.clone());
        }
        return res;
      } catch (err) {
        const status = err instanceof GatewayError
          ? httpStatusFor(err.errorClass)
          : 500;
        return new Response(String(err), { status });
      }
    })());
  });
}
