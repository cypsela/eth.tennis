import {
  contenthashHex,
  encodeUniversalResolverResponse,
} from "./fixtures/rpc.ts";
import { expect, test } from "./setup.ts";

test.describe("error paths", () => {
  test.use({ rpc: {}, ipfs: {} });

  test("ens-not-found shows branded terminal with error line", async ({ page }) => {
    await page.goto("http://ghost.eth.tennis.localhost:5173/");
    await expect(
      page.locator(".line.level-error").filter({ hasText: "ens-not-found" }),
    )
      .toBeVisible({ timeout: 10_000 });
  });

  test("no-contenthash when record resolves but empty", async ({ page, context }) => {
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
      page.locator(".line.level-error").filter({ hasText: "ens-not-found" }).or(
        page.locator(".line.level-error").filter({ hasText: "no-contenthash" }),
      ),
    )
      .toBeVisible({ timeout: 10_000 });
  });

  test("unsupported-protocol for non ipfs/ipns contenthash", async ({ page, context }) => {
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
    await expect(
      page.locator(".line.level-error").filter({
        hasText: "unsupported-protocol",
      }),
    )
      .toBeVisible({ timeout: 10_000 });
  });

  test("rpc-down when RPC returns 503", async ({ page, context }) => {
    await context.route("https://cloudflare-eth.com/**", async (route) => {
      await route.fulfill({ status: 503 });
    });
    await page.goto("http://vitalik.eth.tennis.localhost:5173/");
    await expect(
      page.locator(".line.level-error").filter({ hasText: "rpc-down" }),
    )
      .toBeVisible({ timeout: 10_000 });
  });
});
