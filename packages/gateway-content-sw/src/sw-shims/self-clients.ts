export function createClientsShim(scope: ServiceWorkerGlobalScope): Clients {
  return {
    matchAll: (opts?: ClientQueryOptions) => scope.clients.matchAll(opts),
    get: (id: string) => scope.clients.get(id),
    openWindow: (url: string) => scope.clients.openWindow(url),
    claim: async () => {/* no-op: dispatcher routes for us */},
  } as Clients;
}
