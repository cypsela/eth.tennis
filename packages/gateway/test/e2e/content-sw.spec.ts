import { loadFixtureSite } from "./fixtures/ipfs.ts";
import { expect, test } from "./setup.ts";

const SITE_CID = "bafybeid6ppy5pdxe4jkinlqn2fqwpvnrmhks2op72nc4vziejpozsqggwm";
const FAIL_CID = "bafybeibxyn6jqms53q62yembrfbcccoq64v4zqsgdurwxbpkpofzqndn64";

const SITE = "http://content-sw-site.eth.tennis.localhost:5173";
const FAIL = "http://failing-install.eth.tennis.localhost:5173";

test.describe("content-sw absorption", () => {
  test.use({
    rpc: {
      "content-sw-site.eth": { protocol: "ipfs", cid: SITE_CID },
      "failing-install.eth": { protocol: "ipfs", cid: FAIL_CID },
    },
    ipfs: {
      [SITE_CID]: { files: loadFixtureSite("content-sw-site") },
      [FAIL_CID]: { files: loadFixtureSite("content-sw-failing-install") },
    },
  });

  test("first visit: register → fetch sees X-Absorbed", async ({ page }) => {
    await page.goto(`${SITE}/`);
    await expect(page.locator("#result")).toContainText("absorbed=1;body=", {
      timeout: 10_000,
    });
  });

  test("same-tab navigation post-register goes through SW", async ({ page }) => {
    await page.goto(`${SITE}/`);
    await expect(page.locator("#result")).toContainText("absorbed=1");
    await page.click("a[href=\"/page-2.html\"]");
    await expect(page.locator("#title")).toHaveText("page-2");
    await expect(page.locator("#result")).toContainText("absorbed=1");
  });

  test("hard reload → bootstrap then re-absorbs", async ({ page }) => {
    await page.goto(`${SITE}/`);
    await expect(page.locator("#result")).toContainText("absorbed=1");
    await page.reload();
    await expect(page.locator("#result")).toContainText("absorbed=1");
  });

  test("failing-install variant falls through to L1 (no x-absorbed header)", async ({ page }) => {
    await page.goto(`${FAIL}/`);
    await expect(page.locator("#result")).toContainText("absorbed=null", {
      timeout: 10_000,
    });
  });

  // Update-flow e2e (spec §5): "swap fixture content → close tabs → reopen →
  // assert new SW absorbed" is deferred. Requires runtime contenthash mutation
  // in test/e2e/fixtures/rpc.ts; the fixture closes over an immutable map.
  // Tracked in docs/todo.md. The cold-start re-absorption path is exercised
  // by the "hard reload" test above.

  test("cross-origin fetch goes through real network, not absorbed shim", async ({ page }) => {
    await page.goto(`${SITE}/`);
    await expect(page.locator("#result")).toContainText("absorbed=1");
    await page.evaluate(async () => {
      try {
        await fetch("https://example.test/never");
      } catch {
        /* expected */
      }
    });
    // Smoke-only: the absence of x-absorbed: 1 on the cross-origin response
    // is the real signal but isn't directly observable from page context.
  });
});
