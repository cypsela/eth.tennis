import { test as base } from "@playwright/test";
import { installIpfsFixture, type IpfsFixtures } from "./fixtures/ipfs.ts";
import {
  installRpcFixture,
  type RpcController,
  type RpcFixtures,
} from "./fixtures/rpc.ts";

export const test = base.extend<
  { rpc: RpcFixtures; ipfs: IpfsFixtures; rpcControl: RpcController; }
>({
  rpc: [{}, { option: true }],
  ipfs: [{}, { option: true }],
  rpcControl: async ({ context, rpc }, use) => {
    const ctrl = await installRpcFixture(context, rpc);
    await use(ctrl);
  },
  page: async ({ page, rpcControl, ipfs }, use) => {
    void rpcControl;
    await installIpfsFixture(page, ipfs);
    await use(page);
  },
});

export { expect } from "@playwright/test";
