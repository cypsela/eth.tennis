import { describe, expect, test } from "vitest";
import { progressEventToLine } from "../src/progress.ts";

describe("progressEventToLine", () => {
  test("maps a trustless-gateway block fetch to a gateway host line", () => {
    const line = progressEventToLine(
      "trustless-gateway:get-block:fetch",
      new URL("https://ipfs.filebase.io/ipfs/bafyfoo?format=raw"),
    );
    expect(line).toBe("fetching from ipfs.filebase.io");
  });

  test("accepts a string url in detail", () => {
    const line = progressEventToLine(
      "trustless-gateway:get-block:fetch",
      "https://ipfs.io/ipfs/bafyfoo",
    );
    expect(line).toBe("fetching from ipfs.io");
  });

  test("accepts a {url} object with a URL value in detail", () => {
    const line = progressEventToLine("trustless-gateway:get-block:fetch", {
      url: new URL("https://cdn.example.com/ipfs/bafyfoo"),
    });
    expect(line).toBe("fetching from cdn.example.com");
  });

  test("returns 'fetching block' when detail has no parseable URL", () => {
    expect(progressEventToLine("trustless-gateway:get-block:fetch", null)).toBe(
      "fetching block",
    );
  });

  test("returns null for events we do not surface", () => {
    expect(progressEventToLine("helia:routing:find-providers:start", undefined))
      .toBeNull();
    expect(progressEventToLine("blocks:get:blockstore:get", {})).toBeNull();
  });
});
