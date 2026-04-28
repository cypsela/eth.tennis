import {
  contenthashHex,
  encodeUniversalResolverResponse,
} from "./fixtures/rpc.ts";
import { expect, test } from "./setup.ts";

test.describe("error paths", () => {
  test.use({ rpc: {}, ipfs: {} });

  test("contenthash-not-set shows branded terminal with error line", async ({ page }) => {
    await page.goto("http://ghost.eth.tennis.localhost:5173/");
    await expect(
      page.locator(".line.level-error").filter({
        hasText: "contenthash-not-set",
      }),
    )
      .toBeVisible({ timeout: 10_000 });
  });

  test("contenthash-not-set when RPC returns 0x for contenthash", async ({ page, context }) => {
    await context.route("https://cloudflare-eth.com/**", async (route) => {
      const body = await route.request().postDataJSON() as {
        id?: number | string;
        method: string;
      };
      const id = body.id ?? 1;
      const result = body.method === "eth_call" ? "0x" : "0x1";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ jsonrpc: "2.0", id, result }),
      });
    });
    await page.goto("http://empty.eth.tennis.localhost:5173/");
    await expect(
      page.locator(".line.level-error").filter({
        hasText: "contenthash-not-set",
      }),
    )
      .toBeVisible({ timeout: 10_000 });
  });

  test("no-handler for non ipfs/ipns contenthash (hop logged before failure)", async ({ page, context }) => {
    const swarmHash = contenthashHex(
      "swarm",
      "d1de9994b4d039f6548d191eb26786769f580809256b4685ef316805265ea162",
    );
    const responseHex = encodeUniversalResolverResponse(swarmHash);
    await context.route("https://cloudflare-eth.com/**", async (route) => {
      const body = await route.request().postDataJSON() as {
        id?: number | string;
        method: string;
      };
      const id = body.id ?? 1;
      if (body.method === "eth_call") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ jsonrpc: "2.0", id, result: responseHex }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ jsonrpc: "2.0", id, result: "0x1" }),
      });
    });
    await page.goto("http://weird.eth.tennis.localhost:5173/");
    await expect(page.locator(".line.level-info").filter({ hasText: "bzz:" }))
      .toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator(".line.level-error").filter({ hasText: "no-handler" }),
    )
      .toBeVisible({ timeout: 10_000 });
  });

  test("ens-resolve-failed when RPC returns 503", async ({ page, context }) => {
    await context.route("https://cloudflare-eth.com/**", async (route) => {
      await route.fulfill({ status: 503 });
    });
    await page.goto("http://vitalik.eth.tennis.localhost:5173/");
    await expect(
      page
        .locator(".line.level-error")
        .filter({ hasText: "ens-resolve-failed" })
        .or(
          page.locator(".line.level-error").filter({
            hasText: "content-unreachable",
          }),
        ),
    )
      .toBeVisible({ timeout: 10_000 });
  });
});

test.describe("ipns-address-unrecognized when ipns contenthash is gibberish", () => {
  test.use({
    rpc: { "gibberish.eth": { protocol: "ipns-raw", value: "!!!" } },
    ipfs: {},
  });

  test("decoder rejects non-CID, non-domain ipns value", async ({ page }) => {
    await page.goto("http://gibberish.eth.tennis.localhost:5173/");
    await expect(
      page.locator(".line.level-error").filter({
        hasText: "ipns-address-unrecognized",
      }),
    )
      .toBeVisible({ timeout: 10_000 });
  });
});

test.describe("dnslink success path", () => {
  test.use({
    rpc: {
      "uniswap-test.eth": { protocol: "ipns-raw", value: "dnslink-test.local" },
    },
    doh: {
      "_dnslink.dnslink-test.local": [
        "dnslink=/ipfs/bafybeibgljx73bqnl4yrtbzozneisuoqrakde4nwxs3wlmualwkxneyzdu",
      ],
    },
    ipfs: {
      "bafybeibgljx73bqnl4yrtbzozneisuoqrakde4nwxs3wlmualwkxneyzdu": {
        files: { "/index.html": "<h1>hello dnslink</h1>" },
      },
    },
  });

  test("ENS ipns-with-domain → DNSLink TXT → ipfs CID renders", async ({ page }) => {
    await page.goto("http://uniswap-test.eth.tennis.localhost:5173/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toHaveText("hello dnslink");
  });
});

test.describe("dnslink-record-not-found when DoH returns NXDOMAIN", () => {
  test.use({
    rpc: { "nxdomain.eth": { protocol: "ipns-raw", value: "missing.local" } },
    doh: { "_dnslink.missing.local": null, "missing.local": null },
    ipfs: {},
  });

  test("DoH NXDOMAIN surfaces as dnslink-record-not-found", async ({ page }) => {
    await page.goto("http://nxdomain.eth.tennis.localhost:5173/");
    await expect(
      page.locator(".line.level-error").filter({
        hasText: "dnslink-record-not-found",
      }),
    )
      .toBeVisible({ timeout: 10_000 });
  });
});
