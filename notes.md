# eth.cypsela brainstorm notes

Running log of decisions during brainstorming. Will fold into the design doc later.

## Decisions so far

- **Repo layout:** standalone repo (not part of frostfire.eth monorepo). Makes it reusable beyond frostfire.
- **Name:** `eth.cypsela` (local-only for now; remote repo later).
- **URL shape:** `<name>.eth.<GATEWAY_DOMAIN>`, with multi-level wildcards so subnames like `app.vitalik.eth.<GATEWAY_DOMAIN>` work natively. Gateway domain is a placeholder — picked later.
- **ENS RPC trust model (v1):** hardcoded public RPC (e.g., `cloudflare-eth.com`). Good enough to ship; upgrade path is clear.
- **Feature scope:** ENS-only. Strip CID-as-subdomain, `/ipfs/` & `/ipns/` path routes, DNSLink from upstream `service-worker-gateway`. Keep verified-fetch core + web-gateway behaviors (`index.html`, `_redirects`, web paths).
- **First-load handoff:** Reload-after-activation. CF Worker serves bootstrap HTML → registers SW with `skipWaiting()` + `clients.claim()` → `location.reload()` once active → reload intercepted by SW → SW resolves ENS → verified-fetch → returns content. Content gets native origin control on the reload. Tasteful loading screen hides the flash; one-time cost per SW registration.
- **Caching & freshness:** Honor native TTLs with stale-while-revalidate.
  - ENS contenthash: ~5min in-memory SW cache, stale-while-revalidate.
  - IPNS record: honor the record's own TTL, stale-while-revalidate.
  - IPFS blocks: cache forever (content-addressed, can't go stale).
- **Error UX:** Single bootstrap HTML file is the unified render shell for three modes: (1) registration (default), (2) SW-install failure (bootstrap self-detects), (3) content-level error (SW injects state into bootstrap and returns it as the response). SW has zero HTML — it fetches the precached bootstrap, injects `window.__GATEWAY_STATE__` via a `<!--STATE-->` placeholder, and returns with the correct HTTP status code. One source of branding, rich error UI possible, URL stays stable, bookmarkable.
  - Bootstrap precache: SW install-time `caches.open(...).add('/__bootstrap__.html')` plus any referenced assets (CSS, images). Fetch handler serves these from the same precache before ENS logic.
  - Failure classes surfaced distinctly: `sw-unsupported`, `sw-register-failed`, `sw-activation-timeout`, `ens-not-found`, `no-contenthash`, `unsupported-protocol`, `content-unreachable`, `rpc-down`.
- **Hosting (v1):** CF Pages static hosting with wildcard subdomain routing. No Worker compute needed for v1 — bootstrap is identical for every subdomain, all ENS-specific work is client-side. Architecture kept Worker-compatible for future features.
- **ENS resolution lib (v1):** `@ensdomains/ensjs` (drop-in, matches frostfire.eth stack, handles CCIP-read, subgraphs, subnames, and all ENS edge cases out of the box). Bundle cost ~2x vs pure viem + custom decoder, but acceptable for v1. Revisit bundle optimization post-launch if it matters.
- **Content SW interop:** Principle — don't modify or block user content. If an ENS site registers its own SW, gateway SW is evicted on the next activation (browser enforces one-SW-per-origin). Content SWs that precache everything work fine; content SWs that rely on network fallback will break (network-fetches hit CF Pages → bootstrap HTML). Mitigations:
  - **Opt-in library (ESM-only, npm-only):** ship `@cypsela/gateway-sw-core` as an npm ESM package. Gateway origin does NOT host a copy — content authors bundle it via their own build. Content SWs register with `{type: 'module'}` and `import { install } from '@cypsela/gateway-sw-core'`. Their SW stays in control; gateway-core handles unhandled fetches. No UMD/importScripts build — module SWs are supported everywhere modern (Chrome 80, Safari 15.4, Firefox 114+).
  - **Deployed gateway SW file:** served at `/gw-sw.js` (renamed from `/sw.js` to clearly distinguish the gateway SW from any content SW).
  - **Dev-console warning:** gateway SW detects SW-script fetches (via `request.destination === 'serviceworker'`) and logs a console warning through a `postMessage` to the page's JS context (or via a `<script>` injected into the served HTML). Message points to docs explaining the interop options.
  - **No auto-injection, no blocking.** Content authors decide.
- **Repo layout:** pnpm monorepo based on `tabcat/ts-template-pnpm` conventions (dprint, vitest, pnpm, ESM, husky, workflows for CI/Pages/Publish). Two packages:
  - `packages/gateway-sw-core` — published as `@cypsela/gateway-sw-core` (MIT). Pure library: ENS resolve + verified-fetch fallback handler. tsc build, typedoc docs.
  - `packages/gateway` — deployable site (AGPL-3.0-only, private in npm sense). Vite multi-entry build for `bootstrap.html`, `sw.ts`, and a static re-export of `sw-core.js`. Playwright e2e + vitest unit tests.
- **License split:** `gateway-sw-core` = MIT (low friction for content-author adoption). `gateway` deployable = AGPL-3.0-only (consistent with frostfire.eth, protects the hosted service).
- **NPM scope:** `@cypsela/...` for library. Scope registration deferred.
- **Progress terminal UI (cold first-visit only):** Full-viewport monospace terminal, white-on-black, streams a boot-log-style record of what's happening during SW registration + first resolve+fetch.
  - **Log format (C):** timestamp + tagged source + message, e.g. `[0.287] [sw]        ✓ contenthash: ipfs://bafy…xyz`. Fixed-width tag column for alignment. Source tag attributes each line to `bootstrap` or `sw`.
  - **Level glyphs:** `>` start, `↳` nested detail, `✓` success, `⚠` warning, `✗` error. Errors bold.
  - **Colors (tasteful, not a rainbow):**
    - Timestamp `[0.000]` — dim gray (~#606060)
    - `[bootstrap]` — cyan (~#5aa6d6)
    - `[sw]` — magenta (~#d15ac7)
    - Message text — white default
    - `✓` success — green (~#4caf50)
    - `⚠` warning — yellow (~#e0b040)
    - `✗` error — red (~#d04040), line bold
    - `>` / `↳` — white (no color)
  - **Data flow:** bootstrap registers SW → sends `{type: 'resolve-and-fetch', ensName, path}` via `postMessage` → SW does the work, emits `{kind: 'log', source: 'sw', text, level}` events via `event.source.postMessage` → bootstrap appends each to terminal + dev console → SW sends `{type: 'done'}` → bootstrap reloads → SW serves content from primed cache.
  - **Dual output:** all log entries go to both the terminal UI and `console.info/warn/error`. In the SW context, they ALSO hit the SW devtools pane natively (because the SW calls `console.x` too). Page console receives everything via postMessage forwarding.
  - **Four bootstrap modes:** `cold-start progress` (streams live) / `sw-install-failure` (hardcoded error lines, no reload) / `content-error` (error lines from injected state, no reload) / warm-visit (not shown, SW serves directly).
  - **SW fetch handler has two sub-modes:** `worker-triggered` (bootstrap asked it to resolve-and-fetch, emits progress, primes cache) / `real fetch event` (browser navigation/resource, serves from primed cache, no progress).
  - Reuses gateway-sw-core library for both SW and (if needed) bootstrap.

## Cross-subdomain settings (future, post-v1)

Goal: let the user configure RPC/resolution preferences at the root `<GATEWAY_DOMAIN>` and have every `<name>.eth.<GATEWAY_DOMAIN>` pick them up automatically.

**Why not iframe + postMessage:** Storage Partitioning (Firefox + Safari already, Chrome rolling out) isolates embedded-iframe storage from its top-level origin's storage. The "iframe-reads-root-localStorage-and-postMessages-to-subdomain" pattern silently breaks. Storage Access API works but prompts the user.

**What works cleanly: shared cookie with `Domain=.<GATEWAY_DOMAIN>`.**

- Cookies scoped to the parent domain are naturally shared across all its subdomains. This is same-site and unaffected by third-party cookie phaseout.
- The CF Worker does **not** have to set it. Either side can:
  - Client-side JS at root: `document.cookie = "rpc=...; Domain=.<GATEWAY_DOMAIN>; Path=/; Max-Age=..."`
  - Or CF Worker `Set-Cookie` header (only needed if we want server-side validation).
- Reading: subdomain bootstrap JS reads `document.cookie`, extracts config, posts it to the SW on registration. CF Worker doesn't need to be involved in the read path either.

**Summary:** settings flow is purely client-side. CF Worker only serves the static bootstrap bundle. No cross-origin storage gymnastics required.

This lands as **v1.x**, not v1. V1 ships with a hardcoded RPC and zero UI around this.
