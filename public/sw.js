// Service worker: precaches the app shell (and self-hosted font) so the page opens offline.
// API calls always go to the network. A new version does NOT take over on its own — it waits
// until the page tells it to (SKIP_WAITING), so the page can show an "Updated" toast first.
// Offline store for the precached shell. The fetch handler is network-first, so routine asset changes
// reach returning visitors without touching this name. Bump it only when the SHELL list or the SW
// logic itself changes, to re-precache and clean up old caches on activate.
const CACHE = "baggo-shell-v7";
const SHELL = [
  "/", "/index.html", "/fonts.css?v=1", "/style.css?v=1", "/tokens.css?v=1", "/v2.css?v=1",
  "/db.js?v=1", "/sync.js?v=1", "/app.js?v=1", "/baggo-mark.svg?v=1",
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
  // Only clean up old caches. We deliberately do NOT clients.claim(): claiming a page that loaded
  // without a controller makes the browser reload it, which would interrupt a first-time user
  // mid-task (e.g. creating their first trip). The worker controls the next navigation instead.
  // Updates still work — registerSW drives them via SKIP_WAITING + controllerchange once the page
  // is already controlled (see public/app.js).
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // Network-first for the same-origin shell: returning visitors always get the current code when
  // online, so a changed asset reaches them with no cache-name bump. We re-cache every ok response as
  // the offline copy, and fall back to the cache (and the cached shell for navigations) when offline.
  // Subresources are fetched with cache:"no-cache" to force revalidation even if a CDN marked them
  // immutable; a navigation Request can't take a RequestInit, so it uses a plain re-fetch (its own
  // HTML is served no-cache). This replaces the old cache-first handler, which served stale assets
  // forever because the asset URLs and the cache name never changed (see DECISIONS.md).
  const fromNetwork = e.request.mode === "navigate" ? fetch(e.request) : fetch(e.request, { cache: "no-cache" });
  e.respondWith(
    fromNetwork.then((r) => {
      if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request).then((hit) => hit || (e.request.mode === "navigate" ? caches.match("/index.html") : undefined)))
  );
});
