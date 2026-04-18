import { test as base } from "@playwright/test";
import { installIpfsFixture, type IpfsFixtures } from "./fixtures/ipfs.ts";
import { installRpcFixture, type RpcFixtures } from "./fixtures/rpc.ts";

export const test = base.extend<{ rpc: RpcFixtures; ipfs: IpfsFixtures; }>({
  rpc: [{}, { option: true }],
  ipfs: [{}, { option: true }],
  page: async ({ page, rpc, ipfs }, use) => {
    await installRpcFixture(page, rpc);
    await installIpfsFixture(page, ipfs);
    await use(page);
  },
});

export { expect } from "@playwright/test";
