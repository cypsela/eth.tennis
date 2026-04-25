import { expect, test } from "./setup.ts";

test.use({
  rpc: {
    "vitalik.eth": {
      protocol: "ipfs",
      cid: "bafybeidzx4bdinhpdc62rppw4aoqwshigmkcrvfemhyxuqpotigcyzflsu",
    },
  },
  ipfs: {
    "bafybeidzx4bdinhpdc62rppw4aoqwshigmkcrvfemhyxuqpotigcyzflsu": {
      files: { "/index.html": "<h1>hello vitalik</h1>" },
    },
  },
});

test("cold first visit renders the site", async ({ page }) => {
  const logs: string[] = [];
  page.on("console", (msg) => logs.push(msg.text()));
  await page.goto("http://vitalik.eth.tennis.localhost:5173/");
  await expect(
    page.locator(".line").filter({ hasText: "registering service worker" }),
  )
    .toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("h1")).toHaveText("hello vitalik");
  expect(logs.some((l) => l.includes("ens://") && l.includes("ipfs://"))).toBe(
    true,
  );
});

test("warm subsequent visit skips the terminal", async ({ page }) => {
  await page.goto("http://vitalik.eth.tennis.localhost:5173/");
  await page.waitForLoadState("networkidle");
  await page.goto("http://vitalik.eth.tennis.localhost:5173/other");
  await expect(page.locator(".line")).toHaveCount(0);
});
