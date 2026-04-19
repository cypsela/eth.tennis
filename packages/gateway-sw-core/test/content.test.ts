import { describe, expect, test, vi } from "vitest";
import { createContentFetcherFromImpl } from "../src/content.js";
import {
  ContentUnreachable,
  IpnsRecordNotFound,
  IpnsRecordUnverifiable,
} from "../src/errors.js";

const IPNS_KEY =
  "k51qzi5uqu5dktsyfv7xz8h631pri4ct7osmb43nibxiojpttxzoft6hdyyzg4";

const noopResolver = { resolve: vi.fn() } as any;

describe("content.fetch", () => {
  test("calls verifiedFetch with ipfs URL + path", async () => {
    const body = new TextEncoder().encode("hi");
    const impl = vi.fn(async () =>
      new Response(body, {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
    );
    const f = createContentFetcherFromImpl(impl as any, noopResolver);
    const res = await f.fetch({
      ensName: "vitalik.eth",
      protocol: "ipfs",
      cid: "bafy",
      path: "/index.html",
    });
    expect(impl).toHaveBeenCalledWith("ipfs://bafy/index.html");
    expect(res.status).toBe(200);
  });

  test("wraps ipfs network errors as ContentUnreachable", async () => {
    const impl = vi.fn(async () => {
      throw new Error("no providers");
    });
    const f = createContentFetcherFromImpl(impl as any, noopResolver);
    await expect(
      f.fetch({ ensName: "x.eth", protocol: "ipfs", cid: "bafy", path: "/" }),
    )
      .rejects
      .toBeInstanceOf(ContentUnreachable);
  });

  test("resolves ipns then fetches ipfs URL with combined path", async () => {
    const impl = vi.fn(async () => new Response("ok", { status: 200 }));
    const resolver = {
      resolve: vi.fn(async () => ({
        cid: { toString: () => "bafyResolved" },
        path: "subdir",
      })),
    } as any;
    const f = createContentFetcherFromImpl(impl as any, resolver);
    await f.fetch({
      ensName: "x.eth",
      protocol: "ipns",
      cid: IPNS_KEY,
      path: "/index.html",
    });
    expect(impl).toHaveBeenCalledWith("ipfs://bafyResolved/subdir/index.html");
  });

  test("wraps RecordNotFoundError as IpnsRecordNotFound", async () => {
    const impl = vi.fn();
    const resolver = {
      resolve: vi.fn(async () => {
        const err = new Error("not found");
        err.name = "RecordNotFoundError";
        throw err;
      }),
    } as any;
    const f = createContentFetcherFromImpl(impl as any, resolver);
    await expect(
      f.fetch({ ensName: "x.eth", protocol: "ipns", cid: IPNS_KEY, path: "/" }),
    )
      .rejects
      .toBeInstanceOf(IpnsRecordNotFound);
    expect(impl).not.toHaveBeenCalled();
  });

  test("wraps RecordsFailedValidationError as IpnsRecordUnverifiable", async () => {
    const impl = vi.fn();
    const resolver = {
      resolve: vi.fn(async () => {
        const err = new Error("bad sig");
        err.name = "RecordsFailedValidationError";
        throw err;
      }),
    } as any;
    const f = createContentFetcherFromImpl(impl as any, resolver);
    await expect(
      f.fetch({ ensName: "x.eth", protocol: "ipns", cid: IPNS_KEY, path: "/" }),
    )
      .rejects
      .toBeInstanceOf(IpnsRecordUnverifiable);
  });

  test("wraps unknown ipns resolve errors as ContentUnreachable", async () => {
    const impl = vi.fn();
    const resolver = {
      resolve: vi.fn(async () => {
        throw new Error("something else");
      }),
    } as any;
    const f = createContentFetcherFromImpl(impl as any, resolver);
    await expect(
      f.fetch({ ensName: "x.eth", protocol: "ipns", cid: IPNS_KEY, path: "/" }),
    )
      .rejects
      .toBeInstanceOf(ContentUnreachable);
  });
});
