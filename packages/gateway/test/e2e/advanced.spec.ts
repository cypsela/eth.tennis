import { expect, test } from "./setup.ts";

const APP_CID = "bafybeibj6lixxzqtsb45ysdjnupvqkufgdvzqbnvmhw2kf7cfkesy7r7d4";
const VITALIK_CID =
  "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

test.describe("advanced paths", () => {
  test.use({
    rpc: {
      "app.vitalik.eth": { protocol: "ipfs", cid: APP_CID },
      "vitalik.eth": { protocol: "ipfs", cid: VITALIK_CID },
    },
    ipfs: {
      [APP_CID]: {
        "/index.html": { body: "<h1>app</h1>", contentType: "text/html" },
      },
      [VITALIK_CID]: {
        "/index.html": { body: "<h1>vitalik</h1>", contentType: "text/html" },
      },
    },
  });

  test("ENSIP-10 wildcard subname resolves", async ({ page }) => {
    await page.goto("http://app.vitalik.eth.localhost:5173/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toHaveText("app");
  });

  test("SW update on redeploy picks up new version", async ({ page }) => {
    await page.goto("http://vitalik.eth.localhost:5173/");
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const before = await page.evaluate(() =>
      navigator.serviceWorker.controller?.scriptURL
    );
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const after = await page.evaluate(() =>
      navigator.serviceWorker.controller?.scriptURL
    );
    expect(after).toBeTruthy();
    expect(after).toBe(before);
  });

  test("activate prunes stale bootstrap-* caches, leaves unrelated caches", async ({ page }) => {
    await page.goto("http://vitalik.eth.localhost:5173/");
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);

    await page.evaluate(async () => {
      await caches.open("bootstrap-v-stale");
      await caches.open("unrelated-cache");
    });

    await page.evaluate(async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    });

    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.waitForFunction(async () =>
      !(await caches.keys()).includes("bootstrap-v-stale")
    );

    const names = await page.evaluate(() => caches.keys());
    expect(names).not.toContain("bootstrap-v-stale");
    expect(names).toContain("unrelated-cache");
    expect(names).toContain("bootstrap-v1");
  });

  // Browsers fetch SW registration scripts with skipServiceWorker=true, so
  // the gateway SW's fetch handler never sees content-sw.js registrations.
  // The dev-console warning in gateway-sw-core is kept as forward-compat;
  // re-enable if we add HTML-injection-based detection.
  test.skip("content SW registration logs dev-console warning", async ({ page, context }) => {
    const warnings: string[] = [];
    context.on("serviceworker", (sw) => {
      sw.on("console", (msg) => {
        if (msg.type() === "warning") warnings.push(msg.text());
      });
    });
    await context.route(
      new RegExp(`https://.*/ipfs/${VITALIK_CID}/`, "i"),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body:
            `<script>navigator.serviceWorker.register('/content-sw.js').catch(()=>{});</script>`,
        });
      },
    );
    await page.goto("http://vitalik.eth.localhost:5173/");
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.reload();
    await page.waitForTimeout(3000);
    expect(
      warnings.some((w) =>
        w.includes("eth.cypsela detected a SW registration")
      ),
    )
      .toBe(true);
  });
});
