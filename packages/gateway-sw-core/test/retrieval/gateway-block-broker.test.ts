import { CID } from "multiformats/cid";
import { describe, expect, test, vi } from "vitest";
import { gatewayBlockBroker } from "../../src/retrieval/gateway-block-broker.js";

const CID_A = CID.parse(
  "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
);
const CID_B = CID.parse(
  "bafybeigf6kz6alpe6bapebexbaiwmwb7ifcweakwx22oyl5zo3wwkwix7i",
);
const PRIMARY = "https://primary.example";
const BACKUP = "https://backup.example";
const BLOCK = new Uint8Array([1, 2, 3]);

const ok = (bytes: Uint8Array<ArrayBuffer> = BLOCK): Response =>
  new Response(bytes, { status: 200 });

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function broker(
  fetch: (url: string, init: RequestInit) => Promise<Response>,
  primaryConcurrent = 8,
) {
  return gatewayBlockBroker({
    gateways: [{ url: PRIMARY, maxConcurrent: primaryConcurrent }, {
      url: BACKUP,
      maxConcurrent: 8,
    }],
    fetch,
  });
}

describe("gatewayBlockBroker", () => {
  function slowPrimary(primaryMs: number, backup: () => Promise<Response>) {
    return vi.fn((url: string, init: RequestInit) =>
      url.startsWith(PRIMARY)
        ? new Promise<Response>((resolve, reject) => {
          const t = setTimeout(() => resolve(ok()), primaryMs);
          init.signal!.addEventListener("abort", () => {
            clearTimeout(t);
            reject(init.signal!.reason);
          });
        })
        : backup()
    );
  }

  test("requests the raw block from the primary only", async () => {
    const fetch = vi.fn(async () => ok());
    const out = await broker(fetch).retrieve!(CID_A);

    expect(out).toEqual(BLOCK);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${PRIMARY}/ipfs/${CID_A}?format=raw`);
    expect(new Headers(init.headers).get("accept")).toBe(
      "application/vnd.ipld.raw",
    );
  });

  test("falls back to the next gateway on a non-2xx response", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.startsWith(PRIMARY) ? new Response(null, { status: 429 }) : ok()
    );
    expect(await broker(fetch).retrieve!(CID_A)).toEqual(BLOCK);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("falls back when a gateway returns a block that fails validation", async () => {
    const bad = new Uint8Array([9]);
    const fetch = vi.fn(async (url: string) =>
      url.startsWith(PRIMARY) ? ok(bad) : ok()
    );
    const validateFn = vi.fn(async (block: Uint8Array) => {
      if (block[0] === 9) throw new Error("hash mismatch");
    });
    expect(await broker(fetch).retrieve!(CID_A, { validateFn })).toEqual(BLOCK);
  });

  test("rejects with every gateway failure when none answer", async () => {
    const fetch = vi.fn(async (_url: string) => {
      throw new TypeError("network down");
    });
    const err = await broker(fetch).retrieve!(CID_A).catch((e) => e);
    expect(err).toBeInstanceOf(AggregateError);
    expect((err as AggregateError).errors).toHaveLength(3);
    expect(fetch.mock.calls.map((c) => new URL(c[0] as string).origin)).toEqual(
      [PRIMARY, BACKUP, PRIMARY],
    );
  });

  test("a lone gateway is retried, with a pause, before giving up", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const fetch = vi.fn(async () =>
        ++calls < 3 ? new Response(null, { status: 502 }) : ok()
      );
      const b = gatewayBlockBroker({
        gateways: [{ url: PRIMARY, maxConcurrent: 8 }],
        fetch,
      });
      const pending = b.retrieve!(CID_A);
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(5000);
      expect(await pending).toEqual(BLOCK);
      expect(fetch).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a lone gateway that keeps failing is given up on after three tries", async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi.fn(async () => new Response(null, { status: 502 }));
      const b = gatewayBlockBroker({
        gateways: [{ url: PRIMARY, maxConcurrent: 8 }],
        fetch,
      });
      const pending = b.retrieve!(CID_A).catch((e) => e);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await pending).toBeInstanceOf(AggregateError);
      expect(fetch).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a slow lone gateway is not sent a duplicate request", async () => {
    vi.useFakeTimers();
    try {
      const fetch = slowPrimary(9000, async () => ok());
      const b = gatewayBlockBroker({
        gateways: [{ url: PRIMARY, maxConcurrent: 8 }],
        hedgeAfterMs: 1000,
        fetch,
      });
      const pending = b.retrieve!(CID_A);
      await vi.advanceTimersByTimeAsync(9000);
      expect(await pending).toEqual(BLOCK);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("rejects blocks larger than maxSize", async () => {
    const fetch = vi.fn(async () => ok(new Uint8Array(10)));
    await expect(broker(fetch).retrieve!(CID_A, { maxSize: 4 })).rejects
      .toBeInstanceOf(AggregateError);
  });

  test("overflows to a gateway with spare capacity when the primary is saturated", async () => {
    const gate = deferred();
    const fetch = vi.fn(async (url: string) => {
      if (url.startsWith(PRIMARY)) await gate.promise;
      return ok();
    });
    const b = broker(fetch, 1);
    const first = b.retrieve!(CID_A);
    await Promise.resolve();
    expect(await b.retrieve!(CID_B)).toEqual(BLOCK);
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      `${PRIMARY}/ipfs/${CID_A}?format=raw`,
      `${BACKUP}/ipfs/${CID_B}?format=raw`,
    ]);
    gate.resolve();
    await first;
  });

  test("concurrent requests for one block share a single fetch", async () => {
    const gate = deferred();
    const fetch = vi.fn(async () => {
      await gate.promise;
      return ok();
    });
    const b = broker(fetch);
    const both = Promise.all([b.retrieve!(CID_A), b.retrieve!(CID_A)]);
    gate.resolve();
    expect(await both).toEqual([BLOCK, BLOCK]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("an aborted caller does not cancel a fetch another caller still needs", async () => {
    const gate = deferred();
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      await gate.promise;
      init.signal?.throwIfAborted();
      return ok();
    });
    const b = broker(fetch);
    const controller = new AbortController();
    const quitter = b.retrieve!(CID_A, { signal: controller.signal });
    const stayer = b.retrieve!(CID_A, { signal: new AbortController().signal });
    controller.abort();
    await expect(quitter).rejects.toThrow();
    gate.resolve();
    expect(await stayer).toEqual(BLOCK);
  });

  test("an abort stops the walk through gateways", async () => {
    const controller = new AbortController();
    const fetch = vi.fn(async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    await expect(broker(fetch).retrieve!(CID_A, { signal: controller.signal }))
      .rejects
      .toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  const hedged = (
    fetch: (url: string, init: RequestInit) => Promise<Response>,
  ) =>
    gatewayBlockBroker({
      gateways: [{ url: PRIMARY, maxConcurrent: 8 }, {
        url: BACKUP,
        maxConcurrent: 8,
      }],
      hedgeAfterMs: 1000,
      fetch,
    });

  test("a slow gateway is hedged with the next one after hedgeAfterMs", async () => {
    vi.useFakeTimers();
    try {
      const fetch = slowPrimary(60_000, async () => ok());
      const pending = hedged(fetch).retrieve!(CID_A);
      await vi.advanceTimersByTimeAsync(999);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toEqual(BLOCK);
      expect(fetch).toHaveBeenCalledTimes(2);
      // the losing request is cancelled
      const primaryInit = fetch.mock.calls[0]![1];
      expect(primaryInit.signal!.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a slow gateway still wins if the hedge fails", async () => {
    vi.useFakeTimers();
    try {
      const fetch = slowPrimary(
        5000,
        async () => new Response(null, { status: 429 }),
      );
      const pending = hedged(fetch).retrieve!(CID_A);
      await vi.advanceTimersByTimeAsync(5000);
      expect(await pending).toEqual(BLOCK);
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("reports each gateway request as a progress event", async () => {
    const onProgress = vi.fn();
    await broker(async () => ok()).retrieve!(CID_A, { onProgress });
    const evt = onProgress.mock.calls[0]![0] as CustomEvent<URL>;
    expect(evt.type).toBe("trustless-gateway:get-block:fetch");
    expect(evt.detail.host).toBe("primary.example");
  });

  test("sessions retrieve through the same shaped gateways", async () => {
    const fetch = vi.fn(async () => ok());
    const session = broker(fetch).createSession!();
    await session.addPeer(CID_A);
    expect(await session.retrieve!(CID_A)).toEqual(BLOCK);
  });
});
