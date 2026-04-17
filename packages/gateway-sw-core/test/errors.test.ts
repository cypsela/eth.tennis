import { describe, expect, test } from "vitest";
import {
  ContentUnreachable,
  EnsNotFound,
  GatewayError,
  httpStatusFor,
  IpnsUnverifiable,
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
    expect(new IpnsUnverifiable("vitalik.eth", "bafy").errorClass).toBe(
      "ipns-unverifiable",
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
    expect(httpStatusFor("ipns-unverifiable")).toBe(502);
    expect(httpStatusFor("rpc-down")).toBe(503);
  });
});
