import { expect, test } from "vitest";
import { injectState } from "../src/sw-helpers.ts";

test("injectState replaces <!--STATE--> with a state script", () => {
  const html =
    "<!doctype html><html><head><!--STATE--></head><body></body></html>";
  const out = injectState(html, {
    error: "no-contenthash",
    ensName: "x.eth",
    timestamp: 1700000000000,
  });
  expect(out).toContain("window.__GATEWAY_STATE__");
  expect(out).toContain("\"error\":\"no-contenthash\"");
  expect(out).toContain("\"ensName\":\"x.eth\"");
  expect(out).not.toContain("<!--STATE-->");
});

test("injectState escapes </script> sequences inside state values", () => {
  const html = "<!--STATE-->";
  const out = injectState(html, {
    error: "no-contenthash",
    ensName: "a</script><script>alert(1)//",
    timestamp: 1,
  });
  expect(out).not.toContain("</script><script>");
  expect(out).toContain("\\u003c/script");
});

test("injectState escapes U+2028 and U+2029 line separators", () => {
  const html = "<!--STATE-->";
  const out = injectState(html, {
    error: "no-contenthash",
    ensName: "x.eth",
    details: "line1\u2028line2\u2029line3",
    timestamp: 1,
  });
  expect(out).not.toContain("\u2028");
  expect(out).not.toContain("\u2029");
  expect(out).toContain("\\u2028");
  expect(out).toContain("\\u2029");
});
