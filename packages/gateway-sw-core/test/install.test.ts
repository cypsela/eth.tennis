import { describe, expect, test, vi } from "vitest";
import { install } from "../src/index.js";

function makeFakeSw() {
  const listeners = new Map<string, (ev: any) => void>();
  return {
    addEventListener: (k: string, fn: (ev: any) => void) =>
      listeners.set(k, fn),
    location: new URL("https://vitalik.eth.gateway.example/"),
    listeners,
    registration: { scope: "https://vitalik.eth.gateway.example/" },
    clients: { matchAll: async () => [] },
  };
}

describe("install()", () => {
  test("registers message + fetch handlers", () => {
    const sw = makeFakeSw();
    install(
      sw as any,
      {
        gatewayDomain: "gateway.example",
        rpcUrl: "http://rpc",
        _resolver: { resolve: vi.fn() },
        _content: { fetch: vi.fn() },
      } as any,
    );
    expect(sw.listeners.has("message")).toBe(true);
    expect(sw.listeners.has("fetch")).toBe(true);
  });

  test("extracts ensName from hostname", async () => {
    const sw = makeFakeSw();
    const resolve = vi.fn().mockResolvedValue({
      protocol: "ipfs",
      cid: "bafy",
    });
    const fetch = vi.fn().mockResolvedValue(new Response("hi"));
    install(
      sw as any,
      {
        gatewayDomain: "gateway.example",
        rpcUrl: "http://rpc",
        _resolver: { resolve },
        _content: { fetch },
      } as any,
    );

    const msg = sw.listeners.get("message")!;
    const source = { postMessage: vi.fn() };
    await msg({
      data: { type: "resolve-and-fetch", ensName: "vitalik.eth", path: "/" },
      source,
    });
    expect(resolve).toHaveBeenCalledWith("vitalik.eth");
  });

  test("non-ok fetcher response posts error and skips cache", async () => {
    const sw = makeFakeSw();
    const resolve = vi.fn().mockResolvedValue({
      protocol: "ipfs",
      cid: "bafy",
    });
    const fetch = vi.fn().mockResolvedValue(
      new Response("unreachable", { status: 504 }),
    );
    const render = vi.fn().mockResolvedValue(new Response("shell"));
    install(
      sw as any,
      {
        gatewayDomain: "gateway.example",
        rpcUrl: "http://rpc",
        _resolver: { resolve },
        _content: { fetch },
        renderErrorResponse: render,
      } as any,
    );

    const msg = sw.listeners.get("message")!;
    const source = { postMessage: vi.fn() };
    await msg({
      data: { type: "resolve-and-fetch", ensName: "x.eth", path: "/" },
      source,
    });
    expect(source.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", error: "content-unreachable" }),
    );

    const fetchHandler = sw.listeners.get("fetch")!;
    let responded: Response | undefined;
    fetchHandler({
      request: new Request("https://x.eth.gateway.example/"),
      respondWith: (p: Promise<Response>) => {
        void p.then((r) => (responded = r));
      },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "content-unreachable" }),
    );
    expect(await responded?.text()).toBe("shell");
  });

  test("renderErrorResponse is invoked on fetch-path failures", async () => {
    const sw = makeFakeSw();
    const resolve = vi.fn().mockRejectedValue(new Error("boom"));
    const render = vi.fn().mockResolvedValue(
      new Response("branded", { status: 502 }),
    );
    install(
      sw as any,
      {
        gatewayDomain: "gateway.example",
        rpcUrl: "http://rpc",
        _resolver: { resolve },
        _content: { fetch: vi.fn() },
        renderErrorResponse: render,
      } as any,
    );

    const fetchHandler = sw.listeners.get("fetch")!;
    let responded: Response | undefined;
    fetchHandler({
      request: new Request("https://bad.eth.gateway.example/"),
      respondWith: (p: Promise<Response>) => {
        void p.then((r) => (responded = r));
      },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        ensName: "bad.eth",
        errorClass: "content-unreachable",
      }),
    );
    expect(responded?.status).toBe(502);
  });
});
