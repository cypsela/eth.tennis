import { logOnce } from "../log-once.js";
import { makeStubProxy } from "./stub-proxy.js";

export interface RegistrationShimOpts {
  swUrl?: string;
}

export function createRegistrationShim(
  scope: ServiceWorkerGlobalScope,
  opts: RegistrationShimOpts = {},
): ServiceWorkerRegistration {
  const swUrl = opts.swUrl ?? "/sw.js";
  const scriptURL = new URL(swUrl, scope.registration.scope).href;

  const active = {
    scriptURL,
    state: "activated" as ServiceWorkerState,
    onstatechange: null,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    postMessage() {},
  } as unknown as ServiceWorker;

  const reg = {
    scope: scope.registration.scope,
    installing: null,
    waiting: null,
    active,
    navigationPreload: makeStubProxy("registration.navigationPreload"),
    pushManager: makeStubProxy("registration.pushManager"),
    addEventListener() {},
    removeEventListener() {},
    update: async () => {/* gateway-driven; no-op */},
    unregister: async () => {
      logOnce("registration.unregister");
      return true;
    },
    showNotification: makeStubProxy("registration.showNotification") as never,
    getNotifications: makeStubProxy("registration.getNotifications") as never,
  } as unknown as ServiceWorkerRegistration;

  return reg;
}
