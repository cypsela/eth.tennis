import { installInterceptRegister } from "./intercept-register.js";

(function entry() {
  if (typeof navigator === "undefined") return;
  installInterceptRegister(navigator);
})();
