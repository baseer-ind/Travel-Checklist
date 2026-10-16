// Service worker: precaches the app shell (and self-hosted font) so the page opens offline.
// API calls always go to the network. A new version does NOT take over on its own — it waits
// until the page tells it to (SKIP_WAITING), so the page can show an "Updated" toast first.
const CACHE = "baggo-shell-v5";
const SHELL = [
  "/", "/index.html", "/fonts.css?v=1", "/style.css?v=1", "/tokens.css?v=1", "/v2.css?v=1",
  "/db.js?v=1", "/sync.js?v=1", "/app.js?v=1",
  "/fonts/PlusJakartaSans-latin.woff2",
  "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  // Cache the shell, then wait — the page activates us when it's ready (see app.js registerSW).
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // cache-first for the shell; fall back to the network and backfill the cache
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => (e.request.mode === "navigate" ? caches.match("/index.html") : undefined)))
  );
});
