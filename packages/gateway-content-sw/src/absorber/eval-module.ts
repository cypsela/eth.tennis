import type { CapturedListeners } from "./dispatcher.js";

export type ImportModule = (
  bytes: Uint8Array,
  scope: ServiceWorkerGlobalScope,
) => Promise<void>;

export interface EvaluateSwModuleOpts {
  bytes: Uint8Array;
  scope: ServiceWorkerGlobalScope;
  /** Override the evaluator. Defaults to `new Function('self', code)(scope)`. */
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
    await importModule(opts.bytes, opts.scope);
    return captured;
  } finally {
    (opts.scope as { addEventListener: typeof original; }).addEventListener =
      original;
  }
}

const defaultImportModule: ImportModule = async (bytes, scope) => {
  const code = new TextDecoder().decode(bytes);
  const fn = new Function("self", code) as (
    s: ServiceWorkerGlobalScope,
  ) => void;
  fn(scope);
};
