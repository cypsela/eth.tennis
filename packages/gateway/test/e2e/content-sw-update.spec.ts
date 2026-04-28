import { loadFixtureSite } from "./fixtures/ipfs.ts";
import { stopGatewaySw, waitForGatewaySwLog } from "./fixtures/sw-control.ts";
import { expect, test } from "./setup.ts";

const SITE_CID_V1 =
  "bafybeigdfonbks6qrslxl3drduxefb4aj6vcj4evigpx5esluybihxw554";
const SITE_CID_V2 =
  "bafybeig7mtqgw2ztxt6d6quba4rpg5wliumisnirigh7sozzdhs3yofnli";

const SITE = "http://content-sw-update.eth.tennis.localhost:5173";

test.describe("content-sw cross-mount update", () => {
  test.use({
    rpc: { "content-sw-update.eth": { protocol: "ipfs", cid: SITE_CID_V1 } },
    ipfs: {
      [SITE_CID_V1]: { files: loadFixtureSite("content-sw-site-v1") },
      [SITE_CID_V2]: { files: loadFixtureSite("content-sw-site-v2") },
    },
  });

  test("swap → close → respawn → reopen → new SW absorbed", async ({ page, context, rpcControl }) => {
    await page.goto(`${SITE}/`);
    await expect(page.locator("#result")).toContainText(
      "absorbed=1;version=v1",
      { timeout: 10_000 },
    );

    rpcControl.setContenthash("content-sw-update.eth", {
      protocol: "ipfs",
      cid: SITE_CID_V2,
    });

    await stopGatewaySw(context, page);

    const updateReady = waitForGatewaySwLog(
      context,
      /update ready for content-sw-update\.eth/,
    );
    await page.reload();
    await updateReady;

    await page.close();

    const page2 = await context.newPage();
    await stopGatewaySw(context, page2);
    await page2.goto(`${SITE}/`);
    await expect(page2.locator("#result")).toContainText(
      "absorbed=1;version=v2",
      { timeout: 10_000 },
    );
  });
});
