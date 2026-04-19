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

function navRequest(url: string, site: string | null = "none") {
  const headers = new Headers();
  if (site !== null) headers.set("sec-fetch-site", site);
  return { url, mode: "navigate", headers, destination: "document" } as any;
}

function subRequest(url: string, destination = "script") {
  return { url, mode: "no-cors", headers: new Headers(), destination } as any;
}

async function invoke(
  fetchHandler: (ev: any) => void,
  request: any,
): Promise<Response | undefined> {
  let responded: Response | undefined;
  fetchHandler({
    request,
    respondWith: (p: Response | Promise<Response>) => {
      void Promise.resolve(p).then((r) => (responded = r));
    },
  });
  await new Promise((r) => setTimeout(r, 0));
  return responded;
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

  test("extracts ensName from hostname (message handler)", async () => {
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

  test("message handler: non-ok fetcher response posts error and skips cache", async () => {
    const sw = makeFakeSw();
    const resolve = vi.fn().mockResolvedValue({
      protocol: "ipfs",
      cid: "bafy",
    });
    const fetch = vi.fn().mockResolvedValue(
      new Response("unreachable", { status: 504 }),
    );
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
      data: { type: "resolve-and-fetch", ensName: "x.eth", path: "/" },
      source,
    });
    expect(source.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", error: "content-unreachable" }),
    );
  });

  test("fetch handler: navigation + fresh entry (sec-fetch-site=none) serves shell without resolve+fetch", async () => {
    const sw = makeFakeSw();
    const resolve = vi.fn();
    const fetch = vi.fn();
    const render = vi.fn().mockResolvedValue(new Response("shell"));
    install(
      sw as any,
      {
        gatewayDomain: "gateway.example",
        rpcUrl: "http://rpc",
        _resolver: { resolve },
        _content: { fetch },
        renderBootstrapShell: render,
      } as any,
    );

    const res = await invoke(
      sw.listeners.get("fetch")!,
      navRequest("https://x.eth.gateway.example/", "none"),
    );
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ ensName: "x.eth" }),
    );
    expect(resolve).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(await res?.text()).toBe("shell");
  });

  test("fetch handler: navigation + cross-site serves shell", async () => {
    const sw = makeFakeSw();
    const render = vi.fn().mockResolvedValue(new Response("shell"));
    install(
      sw as any,
      {
        gatewayDomain: "gateway.example",
        rpcUrl: "http://rpc",
        _resolver: { resolve: vi.fn() },
        _content: { fetch: vi.fn() },
        renderBootstrapShell: render,
      } as any,
    );

    const res = await invoke(
      sw.listeners.get("fetch")!,
      navRequest("https://x.eth.gateway.example/about", "cross-site"),
    );
    expect(render).toHaveBeenCalled();
    expect(await res?.text()).toBe("shell");
  });

  test("fetch handler: navigation + same-origin resolves and returns content (no shell)", async () => {
    const sw = makeFakeSw();
    const resolve = vi.fn().mockResolvedValue({
      protocol: "ipfs",
      cid: "bafy",
    });
    const fetch = vi.fn().mockResolvedValue(
      new Response("page", { status: 200 }),
    );
    const render = vi.fn();
    install(
      sw as any,
      {
        gatewayDomain: "gateway.example",
        rpcUrl: "http://rpc",
        _resolver: { resolve },
        _content: { fetch },
        renderBootstrapShell: render,
      } as any,
    );

    const res = await invoke(
      sw.listeners.get("fetch")!,
      navRequest("https://x.eth.gateway.example/about", "same-origin"),
    );
    expect(resolve).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/about" }),
    );
    expect(render).not.toHaveBeenCalled();
    expect(await res?.text()).toBe("page");
  });

  test("fetch handler: navigation + same-origin + resolver throws falls back to shell", async () => {
    const sw = makeFakeSw();
    const resolve = vi.fn().mockRejectedValue(new Error("boom"));
    const render = vi.fn().mockResolvedValue(new Response("shell"));
    install(
      sw as any,
      {
        gatewayDomain: "gateway.example",
        rpcUrl: "http://rpc",
        _resolver: { resolve },
        _content: { fetch: vi.fn() },
        renderBootstrapShell: render,
      } as any,
    );

    const res = await invoke(
      sw.listeners.get("fetch")!,
      navRequest("https://x.eth.gateway.example/about", "same-origin"),
    );
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        ensName: "x.eth",
        errorClass: "content-unreachable",
      }),
    );
    expect(await res?.text()).toBe("shell");
  });

  test("fetch handler: navigation + same-origin + non-ok fetcher response falls back to shell", async () => {
    const sw = makeFakeSw();
    const resolve = vi.fn().mockResolvedValue({
      protocol: "ipfs",
      cid: "bafy",
    });
    const fetch = vi.fn().mockResolvedValue(
      new Response("gone", { status: 504 }),
    );
    const render = vi.fn().mockResolvedValue(new Response("shell"));
    install(
      sw as any,
      {
        gatewayDomain: "gateway.example",
        rpcUrl: "http://rpc",
        _resolver: { resolve },
        _content: { fetch },
        renderBootstrapShell: render,
      } as any,
    );

    const res = await invoke(
      sw.listeners.get("fetch")!,
      navRequest("https://x.eth.gateway.example/about", "same-origin"),
    );
    expect(render).toHaveBeenCalled();
    expect(await res?.text()).toBe("shell");
  });

  test("fetch handler: subresource returns fetcher response as-is (never shell)", async () => {
    const sw = makeFakeSw();
    const resolve = vi.fn().mockResolvedValue({
      protocol: "ipfs",
      cid: "bafy",
    });
    const fetch = vi.fn().mockResolvedValue(
      new Response("js", { status: 200 }),
    );
    const render = vi.fn();
    install(
      sw as any,
      {
        gatewayDomain: "gateway.example",
        rpcUrl: "http://rpc",
        _resolver: { resolve },
        _content: { fetch },
        renderBootstrapShell: render,
      } as any,
    );

    const res = await invoke(
      sw.listeners.get("fetch")!,
      subRequest("https://x.eth.gateway.example/app.js", "script"),
    );
    expect(render).not.toHaveBeenCalled();
    expect(await res?.text()).toBe("js");
  });

  test("fetch handler: subresource non-ok response passes through and is not cached", async () => {
    const sw = makeFakeSw();
    const resolve = vi.fn().mockResolvedValue({
      protocol: "ipfs",
      cid: "bafy",
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockResolvedValueOnce(new Response("missing", { status: 404 }));
    const render = vi.fn();
    install(
      sw as any,
      {
        gatewayDomain: "gateway.example",
        rpcUrl: "http://rpc",
        _resolver: { resolve },
        _content: { fetch },
        renderBootstrapShell: render,
      } as any,
    );

    const first = await invoke(
      sw.listeners.get("fetch")!,
      subRequest("https://x.eth.gateway.example/missing.png", "image"),
    );
    expect(first?.status).toBe(404);

    const second = await invoke(
      sw.listeners.get("fetch")!,
      subRequest("https://x.eth.gateway.example/missing.png", "image"),
    );
    expect(second?.status).toBe(404);
    expect(render).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("fetch handler: cached response is served directly (no resolve+fetch, no shell)", async () => {
    const sw = makeFakeSw();
    const resolve = vi.fn().mockResolvedValue({
      protocol: "ipfs",
      cid: "bafy",
    });
    const fetch = vi.fn().mockResolvedValue(
      new Response("page", { status: 200 }),
    );
    const render = vi.fn();
    install(
      sw as any,
      {
        gatewayDomain: "gateway.example",
        rpcUrl: "http://rpc",
        _resolver: { resolve },
        _content: { fetch },
        renderBootstrapShell: render,
      } as any,
    );

    const first = await invoke(
      sw.listeners.get("fetch")!,
      navRequest("https://x.eth.gateway.example/about", "same-origin"),
    );
    expect(await first?.text()).toBe("page");

    const second = await invoke(
      sw.listeners.get("fetch")!,
      navRequest("https://x.eth.gateway.example/about", "none"),
    );
    expect(await second?.text()).toBe("page");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
  });
});
