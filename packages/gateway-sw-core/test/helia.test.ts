import { describe, expect, test } from "vitest";
import { deriveDbNames } from "../src/helia.js";

describe("deriveDbNames", () => {
  test("default namespace yields library-prefixed DB names", () => {
    const { blocks, data } = deriveDbNames();
    expect(blocks).toBe("@cypsela/gateway-sw-core/blocks");
    expect(data).toBe("@cypsela/gateway-sw-core/data");
  });

  test("custom namespace is used as the prefix", () => {
    const { blocks, data } = deriveDbNames({ namespace: "eth.tennis" });
    expect(blocks).toBe("eth.tennis/blocks");
    expect(data).toBe("eth.tennis/data");
  });
});

describe("createGatewayHelia (smoke)", () => {
  test("exists as an async factory", async () => {
    const mod = await import("../src/helia.js");
    expect(typeof mod.createGatewayHelia).toBe("function");
  });
});
