import type {
  BootstrapToSw,
  GatewayState,
  SwToBootstrap,
} from "@cypsela/gateway-sw-core";
import { makeLogger } from "@cypsela/gateway-sw-core";
import { Terminal } from "./terminal.ts";

export type Mode =
  | "cold-start"
  | "sw-unsupported"
  | "sw-install-failure"
  | "content-error";

export interface WindowWithState extends Window {
  __GATEWAY_STATE__?: GatewayState;
}

export function detectMode(
  win: WindowWithState,
  nav: Navigator = navigator,
): Mode {
  if (win.__GATEWAY_STATE__?.error) return "content-error";
  if (!("serviceWorker" in nav)) return "sw-unsupported";
  return "cold-start";
}

function ensNameFromHost(hostname: string, gatewayDomain: string): string {
  const suffix = `.${gatewayDomain}`;
  return hostname.endsWith(suffix)
    ? hostname.slice(0, -suffix.length)
    : hostname;
}

const GATEWAY_DOMAIN = import.meta.env.VITE_GATEWAY_DOMAIN ?? "gateway.example";

async function runColdStart(terminal: Terminal, startedAt: number) {
  const logger = makeLogger({
    source: "bootstrap",
    startedAt,
    sink: (e) => terminal.append(e),
  });

  logger.info("starting eth.cypsela", ">");
  logger.info("registering service worker", ">");

  try {
    await navigator.serviceWorker.register("/gw-sw.js", {
      scope: "/",
      type: "module",
    });
  } catch (err) {
    logger.error(
      `sw-register-failed: ${err instanceof Error ? err.message : String(err)}`,
      "✗",
    );
    renderRetryButton(() => location.reload());
    return;
  }
  logger.success("registered", "✓");

  const ready = Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), 10_000)
    ),
  ]);
  try {
    await ready;
  } catch {
    logger.error("sw-activation-timeout", "✗");
    renderRetryButton(() => location.reload());
    return;
  }
  logger.success("ready", "✓");

  const ensName = ensNameFromHost(location.hostname, GATEWAY_DOMAIN);
  const path = location.pathname;

  const doneP = new Promise<SwToBootstrap>((resolve) => {
    navigator.serviceWorker.addEventListener("message", (event) => {
      const msg = event.data as SwToBootstrap;
      if (msg.type === "log" && msg.source === "sw") {
        terminal.append({
          t: Number(((Date.now() - startedAt) / 1000).toFixed(3)),
          source: "sw",
          level: msg.level,
          text: msg.text,
          ...(msg.glyph !== undefined ? { glyph: msg.glyph } : {}),
        });
      } else if (msg.type === "done" || msg.type === "error") {
        resolve(msg);
      }
    });
  });

  const ctrl = navigator.serviceWorker.controller
    ?? (await navigator.serviceWorker.ready).active;
  if (!ctrl) {
    logger.error("no controlling SW after activation", "✗");
    return;
  }
  const payload: BootstrapToSw = { type: "resolve-and-fetch", ensName, path };
  ctrl.postMessage(payload);

  const final = await doneP;
  if (final.type === "done") {
    logger.info("loading…", ">");
    location.reload();
  }
}

function renderContentError(terminal: Terminal, startedAt: number) {
  const state = (window as WindowWithState).__GATEWAY_STATE__!;
  const logger = makeLogger({
    source: "sw",
    startedAt,
    sink: (e) => terminal.append(e),
  });
  logger.error(`${state.error}: ${state.ensName}`, "✗");
  if (state.details) {
    logger.info(String(state.details), "↳");
  }
  renderRetryButton(() => location.reload());
}

function renderSwUnsupported(terminal: Terminal, startedAt: number) {
  const logger = makeLogger({
    source: "bootstrap",
    startedAt,
    sink: (e) => terminal.append(e),
  });
  logger.error(
    "sw-unsupported: this browser does not support service workers",
    "✗",
  );
}

function renderRetryButton(onClick: () => void) {
  const host = document.getElementById("terminal")!;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "retry";
  btn.textContent = "retry";
  btn.addEventListener("click", onClick);
  host.appendChild(btn);
}

function main() {
  const host = document.getElementById("terminal");
  if (!host) return;
  const terminal = new Terminal(host);
  const startedAt = Date.now();
  const mode = detectMode(window as WindowWithState);

  switch (mode) {
    case "cold-start":
      void runColdStart(terminal, startedAt);
      break;
    case "content-error":
      renderContentError(terminal, startedAt);
      break;
    case "sw-unsupported":
      renderSwUnsupported(terminal, startedAt);
      break;
    case "sw-install-failure":
      break;
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  main();
}
