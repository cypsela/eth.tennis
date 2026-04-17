# eth.cypsela

Browser-verified ENS gateway. Serves `<name>.eth.<GATEWAY_DOMAIN>` by resolving
ENS in a service worker and retrieving content via `@helia/verified-fetch`.

See `docs/superpowers/specs/2026-04-17-eth-cypsela-design.md` for the design.

## Packages

- `packages/gateway-sw-core` — `@cypsela/gateway-sw-core` (MIT), the SW library.
- `packages/gateway` — the deployable site (AGPL-3.0-only), not published.

## Develop

```sh
pnpm install
pnpm ci
```
