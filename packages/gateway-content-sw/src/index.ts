export const VERSION = "0.0.0";

export type { ContentSwIntegration } from "./absorber/install.js";
export { installContentSw } from "./absorber/install.js";

export {
  type CapturedListeners,
  createDispatcher,
  type Dispatcher,
} from "./absorber/dispatcher.js";
export { evaluateSwModule } from "./absorber/eval-module.js";
export { rehydrate } from "./absorber/rehydrate.js";
export { fireActivate, fireInstall } from "./absorber/synth-events.js";

export { createSwGlobals, type SwGlobals } from "./sw-shims/globals.js";

export { rewriteHtmlForContentSw } from "./rewriter/html-rewriter.js";

export {
  type AbsorbAck,
  type AbsorbFail,
  type AbsorbFailReason,
  type AbsorbRequest,
  type ContentSwMessage,
  isAbsorbAck,
  isAbsorbFail,
  isAbsorbRequest,
} from "./protocol/messages.js";

export { PAGE_SHIM_HASH, PAGE_SHIM_SRC } from "./shim-bundle.js";
