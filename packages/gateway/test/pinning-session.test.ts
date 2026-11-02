// @vitest-environment node
import { delegatedRetrievalInit } from "@cypsela/gateway-sw-core";
import { unixfs } from "@helia/unixfs";
import { MemoryBlockstore } from "blockstore-core";
import { MemoryDatastore } from "datastore-core";
import { createHeliaLight } from "helia";
import { base64 } from "multiformats/bases/base64";
import { CID } from "multiformats/cid";
import { afterEach, expect, test } from "vitest";
import { fetchRootThenDrain } from "../src/pinning.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

/** Builds a small UnixFS directory and returns its root and every block. */
// Blocks are keyed by multihash: getAll() reports raw-codec CIDs.
const key = (cid: CID): string => base64.encode(cid.multihash.bytes);

async function buildSite(): Promise<
  { root: CID; blocks: Map<string, Uint8Array>; }
> {
  const source = await createHeliaLight({
    blockstore: new MemoryBlockstore(),
    datastore: new MemoryDatastore(),
  })
    .start();
  const fs = unixfs(source);
  let root: CID | undefined;
  for await (
    const entry of fs.addAll([{
      path: "index.html",
      content: bytes("<h1>hi</h1>"),
    }, { path: "app.js", content: bytes("console.log(1)") }], {
      wrapWithDirectory: true,
    })
  ) {
    root = entry.cid;
  }
  const blocks = new Map<string, Uint8Array>();
  for await (const { cid, bytes } of source.blockstore.getAll()) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of bytes) chunks.push(chunk);
    blocks.set(key(cid), Buffer.concat(chunks));
  }
  await source.stop();
  return { root: root!, blocks };
}

test("pins a site through one session: one router lookup, every block stored", async () => {
  const { root, blocks } = await buildSite();
  expect(blocks.size).toBeGreaterThan(1);
  let routerLookups = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://router.test/routing/v1/providers/")) {
      routerLookups++;
      return new Response(
        JSON.stringify({
          Providers: [{
            Schema: "peer",
            ID: "12D3KooWDect8DhuEGwWRm3WmbwYE1dkEYsQw7JQAqobmoLWk4fr",
            Protocols: ["transport-ipfs-gateway-http"],
            Addrs: ["/dns4/provider.test/tcp/443/https"],
          }],
        }),
        { headers: { "content-type": "application/json" } },
      );
    }
    const requested = url.match(/^https:\/\/provider\.test\/ipfs\/([^/?]+)/)
      ?.[1];
    const block = requested != null
      ? blocks.get(key(CID.parse(requested)))
      : undefined;
    if (block != null) return new Response(new Uint8Array(block));
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  const helia = await createHeliaLight({
    blockstore: new MemoryBlockstore(),
    datastore: new MemoryDatastore(),
    ...delegatedRetrievalInit(["https://router.test"]),
  })
    .start();
  try {
    const drained = new Promise<void>((resolve, reject) => {
      void fetchRootThenDrain(helia, root, {
        onSuccess: resolve,
        onFailure: reject,
      }, { rootTimeoutMs: 5_000 })
        .catch(reject);
    });
    await drained;
    expect(await helia.pins.isPinned(root)).toBe(true);
    let stored = 0;
    for await (const { cid } of helia.blockstore.getAll()) {
      if (blocks.has(key(cid))) stored++;
    }
    expect(stored).toBe(blocks.size);
    expect(routerLookups).toBe(1);
  } finally {
    await helia.stop();
  }
});
