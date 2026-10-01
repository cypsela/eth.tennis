import { CID } from "multiformats/cid";
import { describe, expect, test, vi } from "vitest";
import { gatewayIpnsRouting } from "../../src/routers/gateway-ipns.js";

const IPNS_KEY =
  "k51qzi5uqu5dktsyfv7xz8h631pri4ct7osmb43nibxiojpttxzoft6hdyyzg4";
const PRIMARY = "https://primary.example";
const BACKUP = "https://backup.example";
const RECORD = new Uint8Array([1, 2, 3]);

function routingKey(name: string): Uint8Array {
  const prefix = new TextEncoder().encode("/ipns/");
  const digest = CID.parse(name).multihash.bytes;
  const key = new Uint8Array(prefix.length + digest.length);
  key.set(prefix);
  key.set(digest, prefix.length);
  return key;
}

function ok(): Response {
  return new Response(RECORD, { status: 200 });
}

describe("gatewayIpnsRouting", () => {
  test("requests the signed record from the first gateway", async () => {
    const fetch = vi.fn(async () => ok());
    const router = gatewayIpnsRouting({ gateways: [PRIMARY, BACKUP], fetch });

    const out = await router.get(routingKey(IPNS_KEY));

    expect(out).toEqual(RECORD);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${PRIMARY}/ipns/${IPNS_KEY}?format=ipns-record`);
    expect(new Headers(init.headers).get("accept")).toBe(
      "application/vnd.ipfs.ipns-record",
    );
  });

  test("falls back to the next gateway on a non-2xx response", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.startsWith(PRIMARY) ? new Response(null, { status: 502 }) : ok()
    );
    const router = gatewayIpnsRouting({ gateways: [PRIMARY, BACKUP], fetch });

    expect(await router.get(routingKey(IPNS_KEY))).toEqual(RECORD);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("falls back to the next gateway on a network error", async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.startsWith(PRIMARY)) throw new TypeError("network down");
      return ok();
    });
    const router = gatewayIpnsRouting({ gateways: [PRIMARY, BACKUP], fetch });

    expect(await router.get(routingKey(IPNS_KEY))).toEqual(RECORD);
  });

  test("rejects with every gateway failure when none answer", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 404 }));
    const router = gatewayIpnsRouting({ gateways: [PRIMARY, BACKUP], fetch });

    const err = await router.get(routingKey(IPNS_KEY)).catch((e) => e);
    expect(err).toBeInstanceOf(AggregateError);
    expect((err as AggregateError).errors).toHaveLength(2);
  });

  test("rejects keys outside the /ipns/ namespace without fetching", async () => {
    const fetch = vi.fn(async () => ok());
    const router = gatewayIpnsRouting({ gateways: [PRIMARY], fetch });

    await expect(router.get(new TextEncoder().encode("/pk/abc"))).rejects
      .toThrow(/ipns/);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("stops trying gateways once the signal is aborted", async () => {
    const controller = new AbortController();
    const fetch = vi.fn(async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    const router = gatewayIpnsRouting({ gateways: [PRIMARY, BACKUP], fetch });

    await expect(
      router.get(routingKey(IPNS_KEY), { signal: controller.signal }),
    )
      .rejects
      .toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
