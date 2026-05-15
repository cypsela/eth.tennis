import {
  ContentHashNotSet,
  ContentUnreachable,
  DnslinkRecordNotFound,
  EnsResolveFailed,
  FetchTimeout,
  IpnsRecordNotFound,
  NoHandler,
  ResolutionLoop,
  ResolveTimeout,
  UnknownError,
} from "@cypsela/gateway-sw-core";
import { describe, expect, test } from "vitest";

import { errorToResponse } from "../src/error-response.ts";

const ipfsRef = {
  kind: "content" as const,
  protocol: "ipfs",
  value: "bafybeidzx4bdinhpdc62rppw4aoqwshigmkcrvfemhyxuqpotigcyzflsu",
};

describe("errorToResponse", () => {
  test("FetchTimeout becomes 504 with errorClass header and body", async () => {
    const err = new FetchTimeout(ipfsRef, 8000);
    const r = errorToResponse(err);
    expect(r.status).toBe(504);
    expect(r.headers.get("x-gateway-error-class")).toBe("fetch-timeout");
    expect(r.headers.get("content-type")).toMatch(/text\/plain/);
    const body = await r.text();
    expect(body.startsWith("fetch-timeout: ")).toBe(true);
    expect(body).toContain("8000ms");
  });

  test("ResolveTimeout becomes 504", () => {
    const err = new ResolveTimeout({
      kind: "address",
      protocol: "ens",
      value: "vitalik.eth",
    }, 4000);
    expect(errorToResponse(err).status).toBe(504);
  });

  test("ContentUnreachable becomes 504", () => {
    const err = new ContentUnreachable("vitalik.eth", new Error("offline"));
    expect(errorToResponse(err).status).toBe(504);
  });

  test("IpnsRecordNotFound becomes 502", async () => {
    const err = new IpnsRecordNotFound("nick.eth", "k51qzi5uqu5dgccx");
    const r = errorToResponse(err);
    expect(r.status).toBe(502);
    expect(r.headers.get("x-gateway-error-class")).toBe(
      "ipns-record-not-found",
    );
    expect(await r.text()).toContain("k51qzi5uqu5dgccx");
  });

  test("DnslinkRecordNotFound becomes 502", () => {
    const err = new DnslinkRecordNotFound("uniswap.eth", "app.uniswap.org");
    expect(errorToResponse(err).status).toBe(502);
  });

  test("EnsResolveFailed becomes 502", () => {
    const err = new EnsResolveFailed("foo.eth");
    expect(errorToResponse(err).status).toBe(502);
  });

  test("ContentHashNotSet becomes 404", () => {
    const err = new ContentHashNotSet("nothing.eth");
    expect(errorToResponse(err).status).toBe(404);
  });

  test("NoHandler becomes 501", () => {
    const err = new NoHandler({
      kind: "content",
      protocol: "bzz",
      value: "d1de9994",
    });
    expect(errorToResponse(err).status).toBe(501);
  });

  test("ResolutionLoop becomes 508", () => {
    const err = new ResolutionLoop({
      kind: "address",
      protocol: "ens",
      value: "loop.eth",
    }, 8);
    expect(errorToResponse(err).status).toBe(508);
  });

  test("UnknownError becomes 500", () => {
    const err = new UnknownError("foo.eth", new Error("kaboom"));
    expect(errorToResponse(err).status).toBe(500);
    expect(errorToResponse(err).headers.get("x-gateway-error-class")).toBe(
      "unknown-error",
    );
  });

  test("plain Error (no errorClass) falls back to 500/unknown-error", async () => {
    const err = new Error("kaboom");
    const r = errorToResponse(err);
    expect(r.status).toBe(500);
    expect(r.headers.get("x-gateway-error-class")).toBe("unknown-error");
    expect(await r.text()).toBe("unknown-error: kaboom");
  });

  test("non-Error throw falls back to 500/unknown-error", async () => {
    const r = errorToResponse("just a string");
    expect(r.status).toBe(500);
    expect(await r.text()).toBe("unknown-error: just a string");
  });
});
