import { logOnce } from "../log-once.js";
import type { Dispatcher } from "./dispatcher.js";
import { evaluateSwModule, type ImportModule } from "./eval-module.js";

export interface RehydrateOpts {
  scope: ServiceWorkerGlobalScope;
  dispatcher: Dispatcher;
  swUrl: string;
  fetchSwScript: (url: string) => Promise<Uint8Array>;
  shim: typeof globalThis.fetch;
  importModule?: ImportModule;
}

export async function rehydrate(opts: RehydrateOpts): Promise<void> {
  let bytes: Uint8Array;
  try {
    bytes = await opts.fetchSwScript(opts.swUrl);
  } catch (err) {
    logOnce("rehydrate.fetch-failed", err);
    return;
  }
  try {
    const captured = await evaluateSwModule({
      bytes,
      scope: opts.scope,
      shim: opts.shim,
      ...(opts.importModule ? { importModule: opts.importModule } : {}),
    });
    opts.dispatcher.register(captured);
  } catch (err) {
    logOnce("rehydrate.eval-failed", err);
  }
}
