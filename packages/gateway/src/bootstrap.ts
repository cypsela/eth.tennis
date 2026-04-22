import type { BootstrapToSw, SwToBootstrap } from "@cypsela/gateway-sw-core";
import { makeLogger } from "@cypsela/gateway-sw-core";
import { Terminal } from "./terminal.ts";

export type Mode = "cold-start" | "sw-unsupported";

export function detectMode(nav: Navigator = navigator): Mode {
  if (!("serviceWorker" in nav)) return "sw-unsupported";
  return "cold-start";
}

function ensNameFromHost(hostname: string, gatewayDomain: string): string {
  const suffix = `.${gatewayDomain}`;
  const bare = hostname.endsWith(suffix)
    ? hostname.slice(0, -suffix.length)
    : hostname;
  return `${bare}.eth`;
}

const GATEWAY_DOMAIN = import.meta.env.VITE_GATEWAY_DOMAIN ?? "gateway.example";

async function runColdStart(terminal: Terminal, startedAt: number) {
  const logger = makeLogger({
    source: "bootstrap",
    startedAt,
    sink: (e) => terminal.append(e),
  });

  logger.info(`starting ${GATEWAY_DOMAIN}`, ">");
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
    location.reload();
  }
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

function main() {
  const host = document.getElementById("terminal");
  if (!host) return;
  const terminal = new Terminal(host);
  const startedAt = Date.now();
  const mode = detectMode();

  switch (mode) {
    case "cold-start":
      void runColdStart(terminal, startedAt);
      break;
    case "sw-unsupported":
      renderSwUnsupported(terminal, startedAt);
      break;
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  main();
}
