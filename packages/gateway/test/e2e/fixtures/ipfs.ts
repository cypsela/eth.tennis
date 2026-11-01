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
  {
    files: Record<string, string | Uint8Array>;
    delayMs?: number | "infinity";
    /** When set, delayMs applies only to the blocks of these file paths. */
    slowPaths?: string[];
  }
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

const ROUTER_PROVIDERS_PATTERN =
  /^https:\/\/router\.test\/routing\/v1\/providers\/([^/?]+)(?:\?.*)?$/;
const ROUTER_PATTERN = /^https:\/\/router\.test\/routing\/v1\/.*$/;
const PROVIDER_PATTERN = /^https:\/\/provider\.test\/ipfs\/([^/?]+)(?:\?.*)?$/;

const PROVIDER_RECORD = {
  Schema: "peer",
  ID: "12D3KooWDect8DhuEGwWRm3WmbwYE1dkEYsQw7JQAqobmoLWk4fr",
  Addrs: ["/dns4/provider.test/tcp/443/https"],
  Protocols: ["transport-ipfs-gateway-http"],
};

export async function installIpfsFixture(
  page: Page,
  fixtures: IpfsFixtures,
): Promise<void> {
  const blocks = new Map<string, Uint8Array>();
  const delays = new Map<string, number | "infinity">();

  for (
    const [expectedCid, { files, delayMs, slowPaths }] of Object.entries(
      fixtures,
    )
  ) {
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
      const slowKeys = new Set<string>();
      for await (
        const entry of fs.addAll(candidates, { wrapWithDirectory: true })
      ) {
        rootCid = entry.cid;
        if (entry.path && slowPaths?.includes(`/${entry.path}`)) {
          slowKeys.add(base32.encode(entry.cid.multihash.bytes));
        }
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
        if (delayMs != null && (!slowPaths || slowKeys.has(key))) {
          delays.set(key, delayMs);
        }
      }
    } finally {
      await helia.stop();
    }
  }

  const keyOf = (cidStr: string): string | undefined => {
    try {
      return base32.encode(CID.parse(cidStr).multihash.bytes);
    } catch {
      return undefined;
    }
  };

  await page.context().route(ROUTER_PATTERN, async (route: Route) => {
    const url = route.request().url();
    const providers = ROUTER_PROVIDERS_PATTERN.exec(url);
    if (providers) {
      const key = keyOf(providers[1]);
      const held = key != null && blocks.has(key);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Providers: held ? [PROVIDER_RECORD] : [] }),
      });
    }
    if (url.includes("/routing/v1/peers/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Peers: [] }),
      });
    }
    return route.fulfill({ status: 404 });
  });

  await page.context().route(PROVIDER_PATTERN, async (route: Route) => {
    const cidStr = PROVIDER_PATTERN.exec(route.request().url())?.[1];
    const key = cidStr ? keyOf(cidStr) : undefined;
    const block = key != null ? blocks.get(key) : undefined;
    if (key == null || !block) return route.fulfill({ status: 404 });
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
}
