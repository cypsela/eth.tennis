# eth.tennis

**Browser-verified ENS gateway.** Visit `<name>.eth.<GATEWAY_DOMAIN>` and the
browser resolves the ENS name, fetches the IPFS/IPNS contenthash, and verifies
every block against its CID — all through a service worker. The gateway
operator hosts only a static bootstrap bundle; no request proxying, no
server-side content retrieval.

## How it differs from eth.limo

[eth.limo](https://eth.limo) is a server-side HTTPS proxy: the operator
resolves ENS, fetches the IPFS content, and streams it to the browser. The
content the user sees is whatever the proxy returns.

eth.tennis does the resolution and retrieval in the browser. After the
service worker activates, the browser queries an Ethereum RPC for the ENS
contenthash and pulls content through `@helia/verified-fetch`, which
hash-verifies every block against that contenthash. The server-side surface
is only a static bootstrap.

In v1 the Ethereum RPC is still a trust anchor for the name → contenthash
mapping. User-configurable RPC and light-client mode are post-v1 work.

## How it works

1. Cold visit to `vitalik.eth.<GATEWAY_DOMAIN>/path`. Cloudflare Pages serves
   the bootstrap HTML.
2. Bootstrap registers `/gw-sw.js`, then asks it (via `postMessage`) to
   resolve-and-fetch. The SW streams progress lines back, rendered as a
   boot-log-style terminal.
3. SW uses `@ensdomains/ensjs` to look up the contenthash, then
   `@helia/verified-fetch` to retrieve and verify the content.
4. Bootstrap triggers a reload; the SW now controls the origin and serves
   content and sub-resources from its primed cache.
5. Warm visits skip the bootstrap entirely — the SW intercepts the first
   request.

Failures (no contenthash, unreachable content, bad IPNS record, RPC down,
etc.) are surfaced by re-rendering the precached bootstrap with state
injected into `window.__GATEWAY_STATE__`. Each class returns a scoped HTTP
status.

## Packages

| Path                       | Package                    | License       | Purpose                                                                  |
| -------------------------- | -------------------------- | ------------- | ------------------------------------------------------------------------ |
| `packages/gateway-sw-core` | `@cypsela/gateway-sw-core` | MIT           | Reusable SW primitives: ENS resolution, verified-fetch dispatch, errors. |
| `packages/gateway`         | `@cypsela/gateway`         | AGPL-3.0-only | Deployable site (bootstrap + SW entrypoint). Private; not published.     |

Content authors who want to run their own SW without losing gateway
resolution can `import { install } from '@cypsela/gateway-sw-core'` and
layer their fetch handler on top.

## Develop

```sh
pnpm install
pnpm dev                # runs @cypsela/gateway on :5173
pnpm build              # builds both packages
pnpm test               # unit tests (vitest) across the workspace
pnpm ci                 # build + test (what CI runs)
```

Try `http://vitalik.eth.tennis.localhost:5173/` once dev is up — Chromium
resolves `*.localhost` to 127.0.0.1 so no hosts-file edits are required.

Per-package scripts live in `packages/*/package.json`. `@cypsela/gateway`
also exposes `pnpm --filter @cypsela/gateway test:e2e` for Playwright.

### Environment variables

Read by `@cypsela/gateway` at build and dev time:

| Name                  | Default                      | Purpose                                                                |
| --------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| `VITE_GATEWAY_DOMAIN` | `gateway.example`            | Suffix the SW strips from `location.hostname` to extract the ENS name. |
| `VITE_RPC_URL`        | `https://cloudflare-eth.com` | Ethereum RPC endpoint for ENS reads.                                   |

Local defaults live in `packages/gateway/.env.development`; a template is at
`packages/gateway/.env.example`.

## Deploy

Production target is Cloudflare Pages with a two-level wildcard certificate
(for ENSIP-10 subnames like `app.vitalik.eth.<domain>`). Step-by-step setup
in [`docs/deploy.md`](docs/deploy.md).

## Design

Full design spec — architecture, trust model, failure classes, caching,
content-SW interop, scope boundaries — in
[`docs/superpowers/specs/2026-04-17-eth-tennis-design.md`](docs/superpowers/specs/2026-04-17-eth-tennis-design.md).

## Status

v1 in active development. End-to-end working: `ipfs://` contenthashes,
libp2p-key `ipns://` contenthashes, subnames, CCIP-read. Known limitations
(`ipns://<dnslink-name>` contenthashes, distinguishing `no-contenthash` from
`ens-not-found`, fetch timeouts) are tracked against the spec.
