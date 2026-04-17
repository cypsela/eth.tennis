# @cypsela/gateway-sw-core

ENS resolution + `@helia/verified-fetch` primitives packaged as an ESM service-worker library.

## Install

```sh
npm i @cypsela/gateway-sw-core
```

## Usage (content-site SW that wants gateway behaviour as a fallback)

```ts
// content-sw.js — registered with { type: 'module' }
import { install } from "@cypsela/gateway-sw-core";

install(self);
```

When no earlier `fetch` handler calls `respondWith`, the gateway's fallback
resolves the current origin's ENS name and serves content via verified-fetch.

## API

See the TypeDoc output at <gh-pages-url>.
