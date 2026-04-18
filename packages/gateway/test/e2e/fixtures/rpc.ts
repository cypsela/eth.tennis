import type { Page, Route } from "@playwright/test";

export interface RpcFixture {
  name: string;
  contenthash: { protocol: "ipfs" | "ipns"; cid: string; } | null;
}

export async function installRpcFixture(
  page: Page,
  fixtures: RpcFixture[],
): Promise<void> {
  await page.route("https://cloudflare-eth.com/**", async (route: Route) => {
    const body = await route.request().postDataJSON() as {
      method: string;
      params: unknown[];
    };
    const result = lookup(body.params, fixtures);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, result }),
    });
  });
}

function lookup(_params: unknown[], _fixtures: RpcFixture[]): string {
  return "0x";
}
