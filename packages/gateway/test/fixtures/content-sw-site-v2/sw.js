self.addEventListener("install", (e) => self.skipWaiting?.());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode === "navigate") return;
  e.respondWith((async () => {
    const r = await fetch(e.request);
    const headers = new Headers(r.headers);
    headers.set("x-absorbed", "1");
    headers.set("x-version", "v2");
    return new Response(await r.arrayBuffer(), {
      status: r.status,
      statusText: r.statusText,
      headers,
    });
  })());
});
