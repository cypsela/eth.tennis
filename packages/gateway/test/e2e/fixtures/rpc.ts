import { encode as encodeContentHash } from "@ensdomains/content-hash";
import type { Page, Route } from "@playwright/test";
import { decodeFunctionData, encodeAbiParameters, type Hex } from "viem";

export type RpcFixtures = Record<
  string,
  { protocol: "ipfs" | "ipns"; cid: string; } | null
>;

const RESOLVE_ABI = [{
  name: "resolve",
  type: "function",
  stateMutability: "view",
  inputs: [{ name: "name", type: "bytes" }, { name: "data", type: "bytes" }],
  outputs: [{ name: "data", type: "bytes" }, {
    name: "resolver",
    type: "address",
  }],
}] as const;

const RESOLVER_ADDRESS = "0x0000000000000000000000000000000000000001";

export async function installRpcFixture(
  page: Page,
  fixtures: RpcFixtures,
): Promise<void> {
  await page.context().route(
    "https://cloudflare-eth.com/**",
    async (route: Route) => {
      const body = await route.request().postDataJSON() as {
        id?: number | string;
        method: string;
        params: unknown[];
      } | null;
      if (!body || typeof body.method !== "string") {
        await route.fulfill({ status: 400 });
        return;
      }
      const id = body.id ?? 1;
      const result = dispatch(body.method, body.params, fixtures);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ jsonrpc: "2.0", id, result }),
      });
    },
  );
}

function dispatch(
  method: string,
  params: unknown[],
  fixtures: RpcFixtures,
): unknown {
  switch (method) {
    case "eth_chainId":
      return "0x1";
    case "eth_blockNumber":
      return "0x1";
    case "eth_getBlockByNumber":
      return {
        number: "0x1",
        hash:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        parentHash:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        timestamp: "0x0",
        transactions: [],
      };
    case "eth_call":
      return handleEthCall(params, fixtures);
    default:
      return "0x";
  }
}

function handleEthCall(params: unknown[], fixtures: RpcFixtures): Hex {
  const call = params[0] as { data: Hex; };
  let ensName: string;
  try {
    const decoded = decodeFunctionData({ abi: RESOLVE_ABI, data: call.data });
    const dnsName = decoded.args[0] as Hex;
    ensName = dnsDecode(dnsName);
  } catch {
    return "0x";
  }
  const ch = fixtures[ensName];
  if (!ch) return "0x";
  const chHex = contenthashHex(ch.protocol, ch.cid);
  return encodeUniversalResolverResponse(chHex);
}

export function contenthashHex(
  protocol:
    | "ipfs"
    | "ipns"
    | "swarm"
    | "onion"
    | "onion3"
    | "skynet"
    | "arweave",
  value: string,
): Hex {
  return ("0x" + encodeContentHash(protocol, value)) as Hex;
}

export function encodeUniversalResolverResponse(contenthashBytes: Hex): Hex {
  const innerResult = encodeAbiParameters([{ type: "bytes" }], [
    contenthashBytes,
  ]);
  return encodeAbiParameters([{ type: "bytes" }, { type: "address" }], [
    innerResult,
    RESOLVER_ADDRESS,
  ]);
}

function dnsDecode(hex: Hex): string {
  const bytes = Buffer.from(hex.slice(2), "hex");
  const labels: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    const len = bytes[i];
    if (len === undefined || len === 0) break;
    labels.push(bytes.subarray(i + 1, i + 1 + len).toString("utf8"));
    i += 1 + len;
  }
  return labels.join(".");
}
