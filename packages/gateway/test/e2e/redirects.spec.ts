import { expect, test } from "./setup.ts";

// A site whose only `_redirects` rule is a 302 that moves the matched segment
// into a query param, the same shape the ENS app ships
// (`/:name /profile/?name=:name 302`). The gateway must surface this as a real
// browser redirect so the URL (and the query the rule adds) updates; otherwise
// `/profile` renders with no `name` and the app bounces home.
const CID = "bafybeidsudrdostwcoo6jwuvabmcx5f4i4wk43efmklpcnhi3if25wssly";

test.use({
  rpc: { "vitalik.eth": { protocol: "ipfs", cid: CID } },
  ipfs: {
    [CID]: {
      files: {
        "/index.html": "<!doctype html><title>home</title><h1>home</h1>",
        "/profile/index.html":
          `<!doctype html><title>profile</title><h1 id="who"></h1>`
          + `<script>document.getElementById("who").textContent="name="`
          + `+(new URLSearchParams(location.search).get("name")??"NONE")</script>`,
        "/_redirects": "/:name /profile/?name=:name 302\n",
      },
    },
  },
});

test("a _redirects 302 on a navigation becomes a real redirect with the query preserved", async ({ page }) => {
  // cold mount, then the served content renders
  await page.goto("http://vitalik.eth.tennis.localhost:5173/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("h1")).toHaveText("home");

  // hard navigation to a single segment that only the _redirects rule matches
  await page.goto("http://vitalik.eth.tennis.localhost:5173/somebody.eth");
  await page.waitForLoadState("networkidle");

  // the browser followed a real 302 to /profile/?name=somebody.eth
  const url = new URL(page.url());
  expect(url.pathname).toBe("/profile/");
  expect(url.searchParams.get("name")).toBe("somebody.eth");
  await expect(page.locator("#who")).toHaveText("name=somebody.eth");
});
