import { unixfs } from "@helia/unixfs";
import type { Page, Route } from "@playwright/test";
import { MemoryBlockstore } from "blockstore-core";
import { MemoryDatastore } from "datastore-core";
import { createHelia } from "helia";
import { base32 } from "multiformats/bases/base32";
import { CID } from "multiformats/cid";
import { readdirSync, readFileSync } from "node:fs";
import { join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";

export type IpfsFixtures = Record<
  string, // expected root CID
  { files: Record<string, string | Uint8Array>; delayMs?: number | "infinity"; }
>;

const FIXTURES_ROOT = fileURLToPath(
  new URL("../../fixtures/", import.meta.url),
);

export function loadFixtureSite(siteName: string): Record<string, Uint8Array> {
  const root = join(FIXTURES_ROOT, siteName);
  const out: Record<string, Uint8Array> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = relative(root, abs).split(/[\\/]+/).join(posix.sep);
      out[`/${rel}`] = readFileSync(abs);
    }
  };
  walk(root);
  return out;
}

const GATEWAY_HOST_PATTERN =
  /^https:\/\/(?:trustless-gateway\.link|4everland\.io)\/ipfs\/([^/?]+)(?:\?format=raw)?$/;

const ROUTING_HOST_PATTERN = /^https:\/\/delegated-ipfs\.dev\/routing\/v1\/.*/;

export async function installIpfsFixture(
  page: Page,
  fixtures: IpfsFixtures,
): Promise<void> {
  const blocks = new Map<string, Uint8Array>();
  const delays = new Map<string, number | "infinity">();

  for (const [expectedCid, { files, delayMs }] of Object.entries(fixtures)) {
    const blockstore = new MemoryBlockstore();
    const helia = await createHelia({
      blockstore,
      datastore: new MemoryDatastore(),
    });
    try {
      const fs = unixfs(helia);
      const candidates = Object.entries(files).map(([path, content]) => ({
        path: path.startsWith("/") ? path.slice(1) : path,
        content: typeof content === "string"
          ? new TextEncoder().encode(content)
          : content,
      }));
      let rootCid: CID | undefined;
      for await (
        const entry of fs.addAll(candidates, { wrapWithDirectory: true })
      ) {
        rootCid = entry.cid;
      }
      if (!rootCid) {
        throw new Error("installIpfsFixture: no root produced by addAll");
      }
      const computedRoot = rootCid.toString();
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
        const key = base32.encode(pair.cid.multihash.bytes);
        blocks.set(key, flat);
        if (delayMs != null) delays.set(key, delayMs);
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
    const key = base32.encode(parsed.multihash.bytes);
    const block = blocks.get(key);
    if (!block) return route.fulfill({ status: 404 });
    const delay = delays.get(key);
    if (delay === "infinity") {
      await new Promise(() => {});
      return;
    }
    if (typeof delay === "number") {
      await new Promise((r) => setTimeout(r, delay));
    }
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
