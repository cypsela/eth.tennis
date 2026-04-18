import { test as base } from "@playwright/test";
import { installIpfsFixture, type IpfsFixture } from "./fixtures/ipfs.ts";
import { installRpcFixture, type RpcFixture } from "./fixtures/rpc.ts";

export const test = base.extend<{ rpc: RpcFixture[]; ipfs: IpfsFixture[]; }>({
  rpc: [[], { option: true }],
  ipfs: [[], { option: true }],
  page: async ({ page, rpc, ipfs }, use) => {
    await installRpcFixture(page, rpc);
    await installIpfsFixture(page, ipfs);
    await use(page);
  },
});

export { expect } from "@playwright/test";
