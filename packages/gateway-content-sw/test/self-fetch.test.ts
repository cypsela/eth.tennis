import { describe, expect, test, vi } from "vitest";
import { createFetchShim } from "../src/sw-shims/self-fetch.js";

describe("self-fetch shim", () => {
  test("routes same-origin requests through sameOriginFetch", async () => {
    const sameOriginFetch = vi.fn(async () => new Response("local"));
    const realFetch = vi.fn(async () => new Response("real"));
    const shim = createFetchShim({
      origin: "https://x.eth.tennis",
      sameOriginFetch,
      realFetch,
    });
    const r = await shim("https://x.eth.tennis/api");
    expect(await r.text()).toBe("local");
    expect(sameOriginFetch).toHaveBeenCalled();
    expect(realFetch).not.toHaveBeenCalled();
  });

  test("routes cross-origin requests through realFetch", async () => {
    const sameOriginFetch = vi.fn(async () => new Response("local"));
    const realFetch = vi.fn(async () => new Response("real"));
    const shim = createFetchShim({
      origin: "https://x.eth.tennis",
      sameOriginFetch,
      realFetch,
    });
    const r = await shim("https://other.example/foo");
    expect(await r.text()).toBe("real");
    expect(realFetch).toHaveBeenCalled();
  });

  test("accepts Request input", async () => {
    const sameOriginFetch = vi.fn(async () => new Response("local"));
    const realFetch = vi.fn(async () => new Response("real"));
    const shim = createFetchShim({
      origin: "https://x.eth.tennis",
      sameOriginFetch,
      realFetch,
    });
    await shim(new Request("https://x.eth.tennis/foo"));
    expect(sameOriginFetch).toHaveBeenCalled();
  });
});
