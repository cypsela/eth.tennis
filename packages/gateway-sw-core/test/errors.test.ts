import { describe, expect, test } from "vitest";
import {
  ContentHashNotSet,
  EnsResolveFailed,
  GatewayError,
  IpnsRecordNotFound,
  IpnsRecordUnverifiable,
  UnsupportedProtocol,
} from "../src/errors.js";

describe("GatewayError subclasses", () => {
  test("each subclass carries its error class name", () => {
    expect(new ContentHashNotSet("vitalik.eth").errorClass).toBe(
      "contenthash-not-set",
    );
    expect(new UnsupportedProtocol("vitalik.eth", "swarm").errorClass).toBe(
      "unsupported-protocol",
    );
    expect(new IpnsRecordNotFound("vitalik.eth", "k51").errorClass).toBe(
      "ipns-record-not-found",
    );
    expect(new IpnsRecordUnverifiable("vitalik.eth", "k51").errorClass).toBe(
      "ipns-record-unverifiable",
    );
    expect(new EnsResolveFailed("vitalik.eth").errorClass).toBe(
      "ens-resolve-failed",
    );
  });

  test("subclasses extend GatewayError", () => {
    expect(new ContentHashNotSet("x") instanceof GatewayError).toBe(true);
  });
});

import { NoHandler, ResolutionLoop } from "../src/errors.js";

describe("NoHandler", () => {
  test("carries 'no-handler' errorClass and references the offending ref", () => {
    const ref = { kind: "address", protocol: "ens", value: "x.eth" } as const;
    const err = new NoHandler(ref);
    expect(err.errorClass).toBe("no-handler");
    expect(err.ref).toBe(ref);
    expect(err.message).toContain("ens://x.eth");
  });

  test("extends GatewayError", () => {
    const ref = { kind: "content", protocol: "ipfs", value: "bafy" } as const;
    expect(new NoHandler(ref) instanceof GatewayError).toBe(true);
  });
});

describe("ResolutionLoop", () => {
  test("carries 'resolution-loop' errorClass and the start ref + hop limit", () => {
    const start = { kind: "address", protocol: "ipns", value: "k51" } as const;
    const err = new ResolutionLoop(start, 8);
    expect(err.errorClass).toBe("resolution-loop");
    expect(err.start).toBe(start);
    expect(err.maxHops).toBe(8);
    expect(err.message).toContain("8");
  });
});

import {
  ContentUnreachable,
  IpnsResolveFailed,
  UnknownError,
} from "../src/errors.js";

describe("IpnsResolveFailed", () => {
  test("carries 'ipns-resolve-failed' errorClass and ipns name in message", () => {
    const err = new IpnsResolveFailed("vitalik.eth", "k51");
    expect(err.errorClass).toBe("ipns-resolve-failed");
    expect(err.ensName).toBe("vitalik.eth");
    expect(err.message).toContain("k51");
  });

  test("preserves cause and includes its message", () => {
    const cause = new Error("offline");
    const err = new IpnsResolveFailed("vitalik.eth", "k51", cause);
    expect((err as { cause?: unknown; }).cause).toBe(cause);
    expect(err.message).toContain("offline");
  });

  test("extends GatewayError", () => {
    expect(new IpnsResolveFailed("x", "k51") instanceof GatewayError).toBe(
      true,
    );
  });
});

describe("ContentUnreachable", () => {
  test("carries 'content-unreachable' errorClass", () => {
    const err = new ContentUnreachable("vitalik.eth");
    expect(err.errorClass).toBe("content-unreachable");
    expect(err.ensName).toBe("vitalik.eth");
  });

  test("includes cause message when provided", () => {
    const cause = new Error("Unable to fetch raw block for CID bafy");
    const err = new ContentUnreachable("vitalik.eth", cause);
    expect((err as { cause?: unknown; }).cause).toBe(cause);
    expect(err.message).toContain("Unable to fetch raw block");
  });
});

describe("UnknownError", () => {
  test("carries 'unknown-error' errorClass", () => {
    const err = new UnknownError("vitalik.eth");
    expect(err.errorClass).toBe("unknown-error");
  });

  test("includes cause message when provided", () => {
    const err = new UnknownError("vitalik.eth", new Error("boom"));
    expect(err.message).toContain("boom");
  });
});
