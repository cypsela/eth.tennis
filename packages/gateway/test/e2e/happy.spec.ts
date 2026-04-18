import { expect, test } from "./setup.ts";

test.use({
  rpc: [{
    name: "vitalik.eth",
    contenthash: {
      protocol: "ipfs",
      cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    },
  }],
  ipfs: [{
    cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    paths: {
      "/index.html": {
        body: "<h1>hello vitalik</h1>",
        contentType: "text/html",
      },
    },
  }],
});

test("cold first visit renders the site", async ({ page }) => {
  await page.goto("http://vitalik.eth.localhost:5173/");
  await expect(
    page.locator(".line").filter({ hasText: "registering service worker" }),
  )
    .toBeVisible();
  await expect(page.locator(".line").filter({ hasText: "contenthash: ipfs" }))
    .toBeVisible({ timeout: 10_000 });
  await page.waitForLoadState("networkidle");
  await expect(page.locator("h1")).toHaveText("hello vitalik");
});

test("warm subsequent visit skips the terminal", async ({ page }) => {
  await page.goto("http://vitalik.eth.localhost:5173/");
  await page.waitForLoadState("networkidle");
  await page.goto("http://vitalik.eth.localhost:5173/other");
  await expect(page.locator(".line")).toHaveCount(0);
});
