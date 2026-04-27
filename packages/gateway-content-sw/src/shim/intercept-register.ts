import { makeFakeRegistration } from "./fake-registration.js";
import { postAbsorb } from "./page-protocol.js";

export function installInterceptRegister(nav: Navigator): void {
  const sw = nav.serviceWorker;
  if (!sw) return;
  const original = sw.register.bind(sw);
  Object.defineProperty(sw, "register", {
    configurable: true,
    value: async (
      url: string | URL,
      _opts?: RegistrationOptions,
    ): Promise<ServiceWorkerRegistration> => {
      const swUrl = typeof url === "string" ? url : url.href;
      const controller = sw.controller;
      if (!controller) {
        return original(url as string, _opts);
      }
      const reply = await postAbsorb(controller, swUrl);
      if (reply.type === "absorb-fail") {
        return makeFakeRegistration(
          new URL(".", location.href).href,
          controller,
        );
      }
      return makeFakeRegistration(new URL(".", location.href).href, controller);
    },
  });
}
