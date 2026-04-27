self.addEventListener("install", () => {
  throw new Error("install-throws");
});
self.addEventListener("fetch", (e) => {
  e.respondWith((async () => {
    const r = await fetch(e.request);
    const headers = new Headers(r.headers);
    headers.set("x-absorbed", "1");
    return new Response(await r.arrayBuffer(), { status: r.status, headers });
  })());
});
