import { describe, expect, test } from "vitest";
import { progressEventToLine } from "../src/progress.ts";

describe("progressEventToLine", () => {
  test("announces the provider lookup", () => {
    expect(progressEventToLine("helia:routing:find-providers:start", {})).toBe(
      "finding providers",
    );
  });

  test("names each provider the router found", () => {
    expect(
      progressEventToLine("trustless-gateway:found-provider", {
        url: "https://provider.test/",
        router: "delegated-http-router",
      }),
    )
      .toBe("provider provider.test");
  });

  test("names the endpoint a block is fetched from", () => {
    expect(
      progressEventToLine("helia:block-brokers:query-provider:start", {
        blockBroker: "trustless-gateway",
        provider: new URL("https://provider.test/"),
        transport: "http",
      }),
    )
      .toBe("fetching from provider.test");
  });

  test("returns null when a provider event has no parseable url", () => {
    expect(progressEventToLine("trustless-gateway:found-provider", {}))
      .toBeNull();
    expect(
      progressEventToLine("helia:block-brokers:query-provider:start", null),
    )
      .toBeNull();
  });

  test("does not surface per-block or unrelated events", () => {
    expect(progressEventToLine("helia:block-broker:receive-block", {}))
      .toBeNull();
    expect(progressEventToLine("blocks:get:blockstore:get", {})).toBeNull();
  });
});
