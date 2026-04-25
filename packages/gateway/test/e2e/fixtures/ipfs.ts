import { unixfs } from "@helia/unixfs";
import type { Page, Route } from "@playwright/test";
import { MemoryBlockstore } from "blockstore-core";
import { MemoryDatastore } from "datastore-core";
import { createHelia } from "helia";
import { base32 } from "multiformats/bases/base32";
import { CID } from "multiformats/cid";

export type IpfsFixtures = Record<
  string, // expected root CID
  { files: Record<string, string | Uint8Array>; }
>;

const GATEWAY_HOST_PATTERN =
  /^https:\/\/(?:trustless-gateway\.link|4everland\.io)\/ipfs\/([^/?]+)(?:\?format=raw)?$/;

const ROUTING_HOST_PATTERN = /^https:\/\/delegated-ipfs\.dev\/routing\/v1\/.*/;

export async function installIpfsFixture(
  page: Page,
  fixtures: IpfsFixtures,
): Promise<void> {
  const blocks = new Map<string, Uint8Array>();

  for (const [expectedCid, { files }] of Object.entries(fixtures)) {
    const blockstore = new MemoryBlockstore();
    const helia = await createHelia({
      blockstore,
      datastore: new MemoryDatastore(),
    });
    try {
      const fs = unixfs(helia);
      let dirCid = await fs.addDirectory();
      for (const [path, content] of Object.entries(files)) {
        const fileBytes = typeof content === "string"
          ? new TextEncoder().encode(content)
          : content;
        const fileCid = await fs.addBytes(fileBytes);
        const segs = path.startsWith("/") ? path.slice(1) : path;
        dirCid = await fs.cp(fileCid, dirCid, segs);
      }
      const computedRoot = dirCid.toString();
      if (computedRoot !== expectedCid) {
        throw new Error(
          `installIpfsFixture: expected root CID ${expectedCid} but built ${computedRoot}. Update the test's CID or the fixture content.`,
        );
      }
      for await (const pair of blockstore.getAll()) {
        const chunks: Uint8Array[] = [];
        for await (const chunk of pair.bytes) chunks.push(chunk);
        const total = chunks.reduce((n, c) => n + c.byteLength, 0);
        const flat = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
          flat.set(c, off);
          off += c.byteLength;
        }
        blocks.set(base32.encode(pair.cid.multihash.bytes), flat);
      }
    } finally {
      await helia.stop();
    }
  }

  await page.context().route(GATEWAY_HOST_PATTERN, async (route: Route) => {
    const url = route.request().url();
    const match = GATEWAY_HOST_PATTERN.exec(url);
    const cidStr = match?.[1];
    if (!cidStr) return route.fulfill({ status: 404 });
    let parsed: CID;
    try {
      parsed = CID.parse(cidStr);
    } catch {
      return route.fulfill({ status: 404 });
    }
    const block = blocks.get(base32.encode(parsed.multihash.bytes));
    if (!block) return route.fulfill({ status: 404 });
    await route.fulfill({
      status: 200,
      contentType: "application/vnd.ipld.raw",
      body: Buffer.from(block),
    });
  });

  await page.context().route(ROUTING_HOST_PATTERN, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: "",
    });
  });
}
