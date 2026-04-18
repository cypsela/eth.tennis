import type { Page, Route } from "@playwright/test";

export type IpfsFixtures = Record<
  string,
  Record<string, { body: string | Uint8Array; contentType: string; }>
>;

export async function installIpfsFixture(
  page: Page,
  fixtures: IpfsFixtures,
): Promise<void> {
  await page.context().route(
    /https:\/\/.*\/ipfs\/.*/i,
    async (route: Route) => {
      const url = new URL(route.request().url());
      const parts = url.pathname.split("/ipfs/")[1] ?? "";
      const [cid, ...rest] = parts.split("/");
      const path = `/${rest.join("/")}`;
      const paths = cid ? fixtures[cid] : undefined;
      if (!paths) return route.fulfill({ status: 404 });
      const entry = paths[path] ?? paths["/index.html"];
      if (!entry) return route.fulfill({ status: 404 });
      await route.fulfill({
        status: 200,
        contentType: entry.contentType,
        body: typeof entry.body === "string"
          ? entry.body
          : Buffer.from(entry.body),
      });
    },
  );
}
