import type { CapturedListeners } from "./dispatcher.js";

export type ImportModule = (
  bytes: Uint8Array,
  self: ServiceWorkerGlobalScope,
  fetch: typeof globalThis.fetch,
) => Promise<void>;

export interface EvaluateSwModuleOpts {
  bytes: Uint8Array;
  scope: ServiceWorkerGlobalScope;
  shim: typeof globalThis.fetch;
  /** Override the evaluator. Defaults to `new Function('self', 'fetch', code)(scope, shim)`. */
  importModule?: ImportModule;
}

export async function evaluateSwModule(
  opts: EvaluateSwModuleOpts,
): Promise<CapturedListeners> {
  const captured: CapturedListeners = {
    fetch: [],
    install: [],
    activate: [],
    message: [],
  };

  const original = opts.scope.addEventListener;
  const patched = (type: string, fn: EventListenerOrEventListenerObject) => {
    const listener = typeof fn === "function" ? fn : fn.handleEvent.bind(fn);
    if (type === "fetch") captured.fetch.push(listener as never);
    else if (type === "install") captured.install.push(listener as never);
    else if (type === "activate") captured.activate.push(listener as never);
    else if (type === "message") captured.message.push(listener as never);
  };
  (opts.scope as { addEventListener: typeof patched; }).addEventListener =
    patched;

  const importModule = opts.importModule ?? defaultImportModule;
  try {
    await importModule(opts.bytes, opts.scope, opts.shim);
    return captured;
  } finally {
    (opts.scope as { addEventListener: typeof original; }).addEventListener =
      original;
  }
}

const defaultImportModule: ImportModule = async (bytes, self, fetch) => {
  const code = new TextDecoder().decode(bytes);
  const fn = new Function("self", "fetch", code) as (
    s: ServiceWorkerGlobalScope,
    f: typeof globalThis.fetch,
  ) => void;
  fn(self, fetch);
};
