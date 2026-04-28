import type { BrowserContext, Route } from "@playwright/test";

export type DohRecords = Record<
  string, // FQDN, e.g. "_dnslink.app.uniswap.org"
  | string[]
  | null // TXT data strings, or null for NXDOMAIN
>;

const DOH_HOST_PATTERN =
  /^https:\/\/(?:cloudflare-dns\.com\/dns-query|dns\.google\/resolve)\?(.*)$/;

export async function installDohFixture(
  context: BrowserContext,
  records: DohRecords,
): Promise<void> {
  const map = new Map(Object.entries(records));
  await context.route(DOH_HOST_PATTERN, async (route: Route) => {
    const url = route.request().url();
    const params = new URL(url).searchParams;
    const name = params.get("name");
    if (!name) return route.fulfill({ status: 400 });
    const type = params.get("type") ?? "TXT";
    const entry = map.get(name);
    if (entry === null) {
      await route.fulfill({
        status: 200,
        contentType: "application/dns-json",
        body: JSON.stringify({
          Status: 3,
          Question: [{ name, type }],
          Answer: [],
        }),
      });
      return;
    }
    if (entry === undefined || type !== "TXT") {
      await route.fulfill({
        status: 200,
        contentType: "application/dns-json",
        body: JSON.stringify({
          Status: 0,
          Question: [{ name, type }],
          Answer: [],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/dns-json",
      body: JSON.stringify({
        Status: 0,
        Question: [{ name, type }],
        Answer: entry.map((data) => ({
          name,
          type: 16,
          TTL: 60,
          data: `"${data}"`,
        })),
      }),
    });
  });
}
