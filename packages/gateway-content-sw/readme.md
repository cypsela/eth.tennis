# @cypsela/gateway-content-sw

Transparent service worker absorption for the eth.tennis gateway. Lets ENS sites
register their own service workers (`navigator.serviceWorker.register('/sw.js')`)
without the gateway losing its own routing role.
