# @cypsela/gateway-sw-core

ENS resolution + `@helia/verified-fetch` primitives packaged as an ESM service-worker library.

## Install

```sh
npm i @cypsela/gateway-sw-core
```

## Usage

`@cypsela/gateway-sw-core` is a toolkit of composable primitives — ENS, IPNS
and DNSLink resolvers, an IPFS verified-fetch dispatcher, the resolve→fetch
chain, Helia setup, an SWR cache, and the typed `ErrorClass` errors. There is
no single-call installer; you wire the pieces into your own service worker.

See `packages/gateway/src/sw.ts` for the reference integration.

## API

See the TypeDoc output at <gh-pages-url>.
