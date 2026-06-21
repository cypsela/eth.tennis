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

test("terminal does not overflow horizontally on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("http://vitalik.eth.tennis.localhost:5173/");
  await expect(
    page.locator(".line").filter({ hasText: "registering service worker" }),
  )
    .toBeVisible();
  const overflow = await page.evaluate(() => {
    const t = document.getElementById("terminal")!;
    return t.scrollWidth - t.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
});
