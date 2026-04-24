import { describe, expect, test } from "vitest";
import {
  ContentUnreachable,
  EnsNotFound,
  GatewayError,
  httpStatusFor,
  IpnsRecordNotFound,
  IpnsRecordUnverifiable,
  NoContenthash,
  RpcDown,
  UnsupportedProtocol,
} from "../src/errors.js";

describe("GatewayError subclasses", () => {
  test("each subclass carries its error class name", () => {
    expect(new EnsNotFound("vitalik.eth").errorClass).toBe("ens-not-found");
    expect(new NoContenthash("vitalik.eth").errorClass).toBe("no-contenthash");
    expect(new UnsupportedProtocol("vitalik.eth", "swarm").errorClass).toBe(
      "unsupported-protocol",
    );
    expect(new ContentUnreachable("vitalik.eth", "bafy").errorClass).toBe(
      "content-unreachable",
    );
    expect(new IpnsRecordNotFound("vitalik.eth", "k51").errorClass).toBe(
      "ipns-record-not-found",
    );
    expect(new IpnsRecordUnverifiable("vitalik.eth", "k51").errorClass).toBe(
      "ipns-record-unverifiable",
    );
    expect(new RpcDown("vitalik.eth").errorClass).toBe("rpc-down");
  });

  test("subclasses extend GatewayError", () => {
    expect(new EnsNotFound("x") instanceof GatewayError).toBe(true);
  });
});

describe("httpStatusFor", () => {
  test("maps each error class to its spec status", () => {
    expect(httpStatusFor("ens-not-found")).toBe(404);
    expect(httpStatusFor("no-contenthash")).toBe(404);
    expect(httpStatusFor("unsupported-protocol")).toBe(415);
    expect(httpStatusFor("content-unreachable")).toBe(502);
    expect(httpStatusFor("ipns-record-not-found")).toBe(404);
    expect(httpStatusFor("ipns-record-unverifiable")).toBe(502);
    expect(httpStatusFor("rpc-down")).toBe(503);
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

describe("httpStatusFor new classes", () => {
  test("no-handler → 501, resolution-loop → 508", () => {
    expect(httpStatusFor("no-handler")).toBe(501);
    expect(httpStatusFor("resolution-loop")).toBe(508);
  });
});
