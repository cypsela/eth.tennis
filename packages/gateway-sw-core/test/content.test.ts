import { describe, expect, test, vi } from "vitest";
import { createContentFetcherFromImpl } from "../src/content.js";
import { ContentUnreachable, IpnsUnverifiable } from "../src/errors.js";

describe("content.fetch", () => {
  test("calls verifiedFetch with ipfs URL + path", async () => {
    const body = new TextEncoder().encode("hi");
    const impl = vi.fn(async () =>
      new Response(body, {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
    );
    const f = createContentFetcherFromImpl(impl as any);
    const res = await f.fetch({
      ensName: "vitalik.eth",
      protocol: "ipfs",
      cid: "bafy",
      path: "/index.html",
    });
    expect(impl).toHaveBeenCalledWith("ipfs://bafy/index.html");
    expect(res.status).toBe(200);
  });

  test("wraps network errors as ContentUnreachable", async () => {
    const impl = vi.fn(async () => {
      throw new Error("no providers");
    });
    const f = createContentFetcherFromImpl(impl as any);
    await expect(
      f.fetch({ ensName: "x.eth", protocol: "ipfs", cid: "bafy", path: "/" }),
    )
      .rejects
      .toBeInstanceOf(ContentUnreachable);
  });

  test("wraps ipns verification failures as IpnsUnverifiable", async () => {
    const impl = vi.fn(async () => {
      throw new Error("ipns: record signature invalid");
    });
    const f = createContentFetcherFromImpl(impl as any);
    await expect(
      f.fetch({ ensName: "x.eth", protocol: "ipns", cid: "k2", path: "/" }),
    )
      .rejects
      .toBeInstanceOf(IpnsUnverifiable);
  });
});
