import type { SwState } from "@cypsela/gateway-sw-core";
import { logOnce } from "../log-once.js";
import {
  type AbsorbAck,
  type AbsorbFail,
  type AbsorbFailReason,
  isAbsorbRequest,
} from "../protocol/messages.js";
import { createDispatcher } from "./dispatcher.js";
import { evaluateSwModule, type ImportModule } from "./eval-module.js";
import { rehydrate } from "./rehydrate.js";
import { fireActivate, fireInstall } from "./synth-events.js";

export interface ContentSwIntegration {
  scope: ServiceWorkerGlobalScope;
  readSwState(): SwState | null;
  writeSwState(state: SwState): Promise<void>;
  fetchSwScript: (url: string) => Promise<Uint8Array>;
  defaultFetch: (event: FetchEvent) => Promise<Response>;
  importModule?: ImportModule;
}

export function installContentSw(integration: ContentSwIntegration): void {
  const dispatcher = createDispatcher();
  const { scope } = integration;

  scope.addEventListener("fetch", (event) => {
    if (dispatcher.handle(event)) return;
    event.respondWith(integration.defaultFetch(event));
  });

  scope.addEventListener("message", (event) => {
    const data = (event as ExtendableMessageEvent).data;
    if (!isAbsorbRequest(data)) return;
    const port = (event as ExtendableMessageEvent).ports[0];
    if (!port) {
      logOnce("absorb.no-port");
      return;
    }
    (event as ExtendableMessageEvent).waitUntil(
      handleAbsorb(integration, dispatcher, data.swUrl).then((reply) =>
        port.postMessage(reply)
      ),
    );
  });

  const existing = integration.readSwState();
  if (existing && existing.swInstalled && existing.swActivated) {
    void rehydrate({
      scope,
      dispatcher,
      swUrl: existing.swUrl,
      fetchSwScript: integration.fetchSwScript,
      ...(integration.importModule
        ? { importModule: integration.importModule }
        : {}),
    });
  }
}

async function handleAbsorb(
  integration: ContentSwIntegration,
  dispatcher: ReturnType<typeof createDispatcher>,
  swUrl: string,
): Promise<AbsorbAck | AbsorbFail> {
  const fail = (reason: AbsorbFailReason, err: unknown): AbsorbFail => {
    logOnce(`absorb.${reason}`, err);
    return { type: "absorb-fail", swUrl, reason };
  };

  let bytes: Uint8Array;
  try {
    bytes = await integration.fetchSwScript(swUrl);
  } catch (err) {
    return fail("fetch-failed", err);
  }

  let captured;
  try {
    captured = await evaluateSwModule({
      bytes,
      scope: integration.scope,
      ...(integration.importModule
        ? { importModule: integration.importModule }
        : {}),
    });
  } catch (err) {
    return fail("eval-failed", err);
  }

  try {
    await fireInstall(captured.install);
  } catch (err) {
    return fail("install-failed", err);
  }
  try {
    await fireActivate(captured.activate);
  } catch (err) {
    return fail("activate-failed", err);
  }

  await integration.writeSwState({
    swUrl,
    swInstalled: true,
    swActivated: true,
  });
  dispatcher.register(captured);
  return { type: "absorb-ack", swUrl };
}
