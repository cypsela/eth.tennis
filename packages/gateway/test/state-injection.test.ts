import { expect, test } from "vitest";
import { injectState } from "../src/sw.ts";

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
