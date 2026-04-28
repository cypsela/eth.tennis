import { test as base } from "@playwright/test";
import { type DohRecords, installDohFixture } from "./fixtures/doh.ts";
import { installIpfsFixture, type IpfsFixtures } from "./fixtures/ipfs.ts";
import {
  installRpcFixture,
  type RpcController,
  type RpcFixtures,
} from "./fixtures/rpc.ts";

export const test = base.extend<
  {
    rpc: RpcFixtures;
    ipfs: IpfsFixtures;
    doh: DohRecords;
    rpcControl: RpcController;
  }
>({
  rpc: [{}, { option: true }],
  ipfs: [{}, { option: true }],
  doh: [{}, { option: true }],
  rpcControl: async ({ context, rpc }, use) => {
    const ctrl = await installRpcFixture(context, rpc);
    await use(ctrl);
  },
  page: async ({ page, rpcControl, ipfs, context, doh }, use) => {
    void rpcControl;
    await installDohFixture(context, doh);
    await installIpfsFixture(page, ipfs);
    await use(page);
  },
});

export { expect } from "@playwright/test";
