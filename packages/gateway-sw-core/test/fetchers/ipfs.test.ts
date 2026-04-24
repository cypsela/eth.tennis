import { describe, expect, test, vi } from "vitest";
import { createIpfsFetcherFromImpl } from "../../src/fetchers/ipfs.js";

describe("ipfs fetcher", () => {
  test("protocol is 'ipfs'", () => {
    const f = createIpfsFetcherFromImpl(vi.fn() as any);
    expect(f.protocol).toBe("ipfs");
  });

  test("calls verified-fetch with 'ipfs://<cid><path>' (leading slash added)", async () => {
    const impl = vi.fn(async () => new Response("ok", { status: 200 }));
    const f = createIpfsFetcherFromImpl(impl as any);
    await f.fetch(
      { kind: "content", protocol: "ipfs", value: "bafy" },
      "/index.html",
    );
    expect(impl).toHaveBeenCalledWith("ipfs://bafy/index.html");
  });

  test("adds leading slash when path lacks one", async () => {
    const impl = vi.fn(async () => new Response("ok", { status: 200 }));
    const f = createIpfsFetcherFromImpl(impl as any);
    await f.fetch(
      { kind: "content", protocol: "ipfs", value: "bafy" },
      "relative.html",
    );
    expect(impl).toHaveBeenCalledWith("ipfs://bafy/relative.html");
  });

  test("passes Response through unchanged (200)", async () => {
    const body = new TextEncoder().encode("hi");
    const impl = vi.fn(async () =>
      new Response(body, { status: 200, headers: { "x-test": "1" } })
    );
    const f = createIpfsFetcherFromImpl(impl as any);
    const res = await f.fetch({
      kind: "content",
      protocol: "ipfs",
      value: "bafy",
    }, "/");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-test")).toBe("1");
  });

  test("passes 404/412/504 through unchanged (no throws)", async () => {
    const impl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 412 }))
      .mockResolvedValueOnce(new Response(null, { status: 504 }));
    const f = createIpfsFetcherFromImpl(impl as any);
    const r1 = await f.fetch(
      { kind: "content", protocol: "ipfs", value: "b" },
      "/a",
    );
    const r2 = await f.fetch(
      { kind: "content", protocol: "ipfs", value: "b" },
      "/b",
    );
    const r3 = await f.fetch(
      { kind: "content", protocol: "ipfs", value: "b" },
      "/c",
    );
    expect([r1.status, r2.status, r3.status]).toEqual([404, 412, 504]);
  });
});
