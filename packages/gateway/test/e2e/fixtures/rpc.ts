import { encode as encodeContentHash } from "@ensdomains/content-hash";
import type { BrowserContext, Route } from "@playwright/test";
import { decodeFunctionData, encodeAbiParameters, type Hex } from "viem";

export type ContentHashValue = { protocol: "ipfs" | "ipns"; cid: string; } | {
  protocol: "ipns-raw";
  value: string;
} | null;

export type RpcFixtures = Record<string, ContentHashValue>;

export interface RpcController {
  setContenthash(ens: string, value: ContentHashValue): void;
}

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
  context: BrowserContext,
  fixtures: RpcFixtures,
): Promise<RpcController> {
  const map = new Map<string, ContentHashValue>(Object.entries(fixtures));
  await context.route("https://cloudflare-eth.com/**", async (route: Route) => {
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
    const result = dispatch(body.method, body.params, map);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jsonrpc: "2.0", id, result }),
    });
  });
  return {
    setContenthash(ens, value) {
      map.set(ens, value);
    },
  };
}

function dispatch(
  method: string,
  params: unknown[],
  fixtures: Map<string, ContentHashValue>,
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

function handleEthCall(
  params: unknown[],
  fixtures: Map<string, ContentHashValue>,
): Hex {
  const call = params[0] as { data: Hex; };
  let ensName: string;
  try {
    const decoded = decodeFunctionData({ abi: RESOLVE_ABI, data: call.data });
    const dnsName = decoded.args[0] as Hex;
    ensName = dnsDecode(dnsName);
  } catch {
    return "0x";
  }
  const ch = fixtures.get(ensName);
  if (!ch) return "0x";
  const chHex = ch.protocol === "ipns-raw"
    ? ipnsRawContenthashHex(ch.value)
    : contenthashHex(ch.protocol, ch.cid);
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

/**
 * Builds an "ipns" contenthash whose decoded value is an arbitrary string
 * (domain, gibberish) by wrapping the UTF-8 bytes in a CIDv1 with identity
 * multihash + libp2p-key codec — the deprecated non-cryptographic IPNS shape
 * still seen in old ENS records.
 */
export function ipnsRawContenthashHex(value: string): Hex {
  const utf8 = new TextEncoder().encode(value);
  if (utf8.length > 35) {
    throw new Error(
      `ipnsRawContenthashHex: value too long (${utf8.length} > 35 bytes)`,
    );
  }
  const mh = new Uint8Array(2 + utf8.length);
  mh[0] = 0x00;
  mh[1] = utf8.length;
  mh.set(utf8, 2);
  const cidv1 = new Uint8Array(2 + mh.length);
  cidv1[0] = 0x01;
  cidv1[1] = 0x72;
  cidv1.set(mh, 2);
  const all = new Uint8Array(2 + cidv1.length);
  all[0] = 0xe5;
  all[1] = 0x01;
  all.set(cidv1, 2);
  return ("0x" + Buffer.from(all).toString("hex")) as Hex;
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
