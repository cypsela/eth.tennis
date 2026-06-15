import { describe, expect, test } from "vitest";
import { isRedirectStatus, toSameOriginRedirect } from "../src/redirect.ts";

describe("isRedirectStatus", () => {
  test("true for 301/302/303/307/308", () => {
    expect([301, 302, 303, 307, 308].every(isRedirectStatus)).toBe(true);
  });
  test("false for non-redirect statuses", () => {
    expect([200, 204, 304, 404, 412, 500, 504].some(isRedirectStatus)).toBe(
      false,
    );
  });
});

describe("toSameOriginRedirect", () => {
  const origin = "https://vitalik.eth.tennis.localhost:5173";

  test("rewrites an ipfs:// Location to the gateway origin, preserving query", () => {
    const res = new Response(null, {
      status: 302,
      headers: { location: "ipfs://bafycid/profile/?name=vitalik.eth" },
    });
    const out = toSameOriginRedirect(res, origin);
    expect(out.status).toBe(302);
    expect(out.headers.get("location")).toBe(
      `${origin}/profile/?name=vitalik.eth`,
    );
  });

  test("rewrites an ipns:// Location too", () => {
    const res = new Response(null, {
      status: 301,
      headers: { location: "ipns://k51abc/app/?x=1#frag" },
    });
    const out = toSameOriginRedirect(res, origin);
    expect(out.headers.get("location")).toBe(`${origin}/app/?x=1#frag`);
  });

  test("leaves an external absolute Location untouched", () => {
    const res = new Response(null, {
      status: 301,
      headers: { location: "https://example.com/new" },
    });
    const out = toSameOriginRedirect(res, origin);
    expect(out.headers.get("location")).toBe("https://example.com/new");
  });

  test("resolves a relative Location against the origin", () => {
    const res = new Response(null, {
      status: 302,
      headers: { location: "/elsewhere?q=2" },
    });
    const out = toSameOriginRedirect(res, origin);
    expect(out.headers.get("location")).toBe(`${origin}/elsewhere?q=2`);
  });

  test("returns the response unchanged when there is no Location header", () => {
    const res = new Response(null, { status: 302 });
    const out = toSameOriginRedirect(res, origin);
    expect(out.headers.get("location")).toBeNull();
  });
});
