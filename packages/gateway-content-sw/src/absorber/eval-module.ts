import type { CapturedListeners } from "./dispatcher.js";

export type ImportModule = (url: string) => Promise<unknown>;

export interface EvaluateSwModuleOpts {
  bytes: Uint8Array;
  scope: ServiceWorkerGlobalScope;
  /** Defaults to dynamic `import(url)`. Override in tests. */
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

  const blob = new Blob([opts.bytes as BlobPart], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const importModule = opts.importModule
    ?? ((u: string) => import(/* @vite-ignore */ u));
  try {
    await importModule(url);
    return captured;
  } finally {
    URL.revokeObjectURL(url);
    (opts.scope as { addEventListener: typeof original; }).addEventListener =
      original;
  }
}
