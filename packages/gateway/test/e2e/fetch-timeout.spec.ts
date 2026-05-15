import { expect, test } from "./setup.ts";

const SLOW_CID = "bafybeidzx4bdinhpdc62rppw4aoqwshigmkcrvfemhyxuqpotigcyzflsu";

// FETCH_BUDGET.fetchTimeoutMs is 8000ms. 12000ms exceeds it on every block,
// so the gateway's per-fetch path always times out when fetching a fresh
// block.
const SLOW_BLOCK_DELAY_MS = 12_000;

test.describe("sub-resource fetch errors surface via x-gateway-error-class", () => {
  test.use({
    rpc: { "vitalik.eth": { protocol: "ipfs", cid: SLOW_CID } },
    ipfs: {
      [SLOW_CID]: {
        files: { "/index.html": "<h1>hello vitalik</h1>" },
        delayMs: SLOW_BLOCK_DELAY_MS,
      },
    },
  });

  test("verified-fetch timeout becomes 504 fetch-timeout with errorClass header, not raw 500", async ({ page }) => {
    test.setTimeout(60_000);

    const gatewayResponses: Array<
      { url: string; status: number; errorClass: string | null; }
    > = [];
    page.on("response", (res) => {
      const url = res.url();
      // Only the same-origin gateway-served responses, not the
      // bundled shell assets or the SW script itself.
      if (!url.startsWith("http://vitalik.eth.tennis.localhost:5173/")) return;
      if (url.endsWith("/gw-sw.js")) return;
      if (url.includes("/assets/")) return;
      gatewayResponses.push({
        url,
        status: res.status(),
        errorClass: res.headers()["x-gateway-error-class"] ?? null,
      });
    });

    // Bootstrap waits for the root block (~12s), then triggers a reload.
    // The reload's navigation fetches the index.html block fresh — the SW's
    // 8s fetch budget fires first, so the navigation returns the gateway's
    // error response. We assert the response shape.
    await page.goto("http://vitalik.eth.tennis.localhost:5173/");

    // Wait until at least one gateway response has the x-gateway-error-class
    // header set (i.e., the bug path fired).
    await expect
      .poll(() => gatewayResponses.find((r) => r.errorClass != null) ?? null, {
        timeout: 45_000,
        intervals: [500, 1000, 2000],
      })
      .not
      .toBeNull();

    const failed = gatewayResponses.find((r) => r.errorClass != null)!;
    expect(failed.status).toBe(504);
    expect(failed.errorClass).toBe("fetch-timeout");
  });
});
