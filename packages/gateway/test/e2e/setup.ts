import { test as base } from "@playwright/test";
import { installIpfsFixture, type IpfsFixture } from "./fixtures/ipfs.ts";
import { installRpcFixture, type RpcFixture } from "./fixtures/rpc.ts";

export const test = base.extend<{ rpc: RpcFixture[]; ipfs: IpfsFixture[]; }>({
  rpc: [[], { option: true }],
  ipfs: [[], { option: true }],
});

test.beforeEach(async ({ page, rpc, ipfs }) => {
  await installRpcFixture(page, rpc);
  await installIpfsFixture(page, ipfs);
});

export { expect } from "@playwright/test";
