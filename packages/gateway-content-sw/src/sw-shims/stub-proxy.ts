import { logOnce } from "../log-once.js";

export function makeStubProxy(name: string): unknown {
  return new Proxy(function stub() {}, {
    get(_t, prop) {
      const key = `${name}.${String(prop)}`;
      logOnce(`stubbed-api-access: ${key}`);
      return makeStubProxy(key);
    },
    apply() {
      return Promise.resolve(undefined);
    },
  });
}
