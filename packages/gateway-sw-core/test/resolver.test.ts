import { describe, expect, test, vi } from "vitest";
import {
  EnsNotFound,
  NoContenthash,
  UnsupportedProtocol,
} from "../src/errors.js";
import { createResolverFromClient } from "../src/resolver.js";

vi.mock("@ensdomains/ensjs/public", () => ({ getContentHashRecord: vi.fn() }));

import { getContentHashRecord } from "@ensdomains/ensjs/public";
const mocked = vi.mocked(getContentHashRecord);

describe("resolver.resolve", () => {
  const client = {} as any;

  test("returns ipfs contenthash", async () => {
    mocked.mockResolvedValueOnce({
      protocolType: "ipfs",
      decoded: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    });
    const r = createResolverFromClient(client);
    const ch = await r.resolve("vitalik.eth");
    expect(ch).toEqual({
      protocol: "ipfs",
      cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    });
  });

  test("returns ipns contenthash", async () => {
    mocked.mockResolvedValueOnce({ protocolType: "ipns", decoded: "k2k4r8n" });
    const r = createResolverFromClient(client);
    const ch = await r.resolve("example.eth");
    expect(ch.protocol).toBe("ipns");
  });

  test("throws EnsNotFound when record is null", async () => {
    mocked.mockResolvedValueOnce(null);
    const r = createResolverFromClient(client);
    await expect(r.resolve("ghost.eth")).rejects.toBeInstanceOf(EnsNotFound);
  });

  test("throws NoContenthash when decoded is empty", async () => {
    mocked.mockResolvedValueOnce({ protocolType: "ipfs", decoded: "" });
    const r = createResolverFromClient(client);
    await expect(r.resolve("empty.eth")).rejects.toBeInstanceOf(NoContenthash);
  });

  test("throws UnsupportedProtocol for non ipfs/ipns", async () => {
    mocked.mockResolvedValueOnce(
      { protocolType: "swarm", decoded: "xyz" } as any,
    );
    const r = createResolverFromClient(client);
    await expect(r.resolve("weird.eth")).rejects.toBeInstanceOf(
      UnsupportedProtocol,
    );
  });
});
