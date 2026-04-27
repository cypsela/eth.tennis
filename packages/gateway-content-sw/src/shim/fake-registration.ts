export function makeFakeRegistration(
  scope: string,
  active: ServiceWorker,
): ServiceWorkerRegistration {
  const fake = {
    scope,
    installing: null,
    waiting: null,
    active,
    navigationPreload: undefined as unknown as NavigationPreloadManager,
    pushManager: undefined as unknown as PushManager,
    onupdatefound: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    update: async () => {},
    unregister: async () => true,
    showNotification: async () => {},
    getNotifications: async () => [],
  };
  return fake as unknown as ServiceWorkerRegistration;
}
