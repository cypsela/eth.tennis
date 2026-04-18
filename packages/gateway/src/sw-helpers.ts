import type { GatewayState } from "@cypsela/gateway-sw-core";

function escapeForScriptContext(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/-->/g, "--\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function injectState(html: string, state: GatewayState): string {
  const json = escapeForScriptContext(JSON.stringify(state));
  const script = `<script>window.__GATEWAY_STATE__ = ${json};</script>`;
  return html.replace("<!--STATE-->", script);
}
