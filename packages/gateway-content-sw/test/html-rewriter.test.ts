import { describe, expect, test } from "vitest";
import { rewriteHtmlForContentSw } from "../src/rewriter/html-rewriter.js";

const opts = { pageShimSrc: "/* SHIM */", pageShimHash: "abc123" };

describe("rewriteHtmlForContentSw", () => {
  test("non-HTML response passes through", async () => {
    const orig = new Response("body", {
      headers: { "content-type": "text/plain" },
    });
    const out = rewriteHtmlForContentSw(orig, opts);
    expect(await out.text()).toBe("body");
  });

  test("injects shim after <head> open tag", async () => {
    const html =
      "<!doctype html><html><head><title>x</title></head><body></body></html>";
    const out = rewriteHtmlForContentSw(
      new Response(html, { headers: { "content-type": "text/html" } }),
      opts,
    );
    const text = await out.text();
    expect(text).toMatch(/<head>\s*<script>\/\* SHIM \*\/<\/script>/);
  });

  test("injects shim before first <script> when no <head>", async () => {
    const html = "<!doctype html><body><script>x()</script></body>";
    const out = rewriteHtmlForContentSw(
      new Response(html, { headers: { "content-type": "text/html" } }),
      opts,
    );
    const text = await out.text();
    expect(text.indexOf("/* SHIM */")).toBeLessThan(text.indexOf("x()"));
  });

  test("updates existing meta CSP with sha256 hash", async () => {
    const html =
      `<head><meta http-equiv="Content-Security-Policy" content="script-src 'self'"></head><body></body>`;
    const out = rewriteHtmlForContentSw(
      new Response(html, { headers: { "content-type": "text/html" } }),
      opts,
    );
    const text = await out.text();
    expect(text).toContain("'sha256-abc123'");
  });

  test("preserves response status and other headers", async () => {
    const out = rewriteHtmlForContentSw(
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html", "x-custom": "abc" },
      }),
      opts,
    );
    expect(out.status).toBe(200);
    expect(out.headers.get("x-custom")).toBe("abc");
  });
});
