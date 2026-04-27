# @cypsela/gateway-content-sw

Transparent service worker absorption for the eth.tennis gateway. Lets ENS sites
register their own service workers (`navigator.serviceWorker.register('/sw.js')`)
without the gateway losing its own routing role. See
`docs/superpowers/specs/2026-04-27-gateway-content-sw-design.md` for the design.
