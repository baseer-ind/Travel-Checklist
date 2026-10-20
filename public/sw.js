// Service worker: precaches the app shell (and self-hosted font) so the page opens offline.
// API calls always go to the network. A new version takes over as soon as it installs
// (skipWaiting) and claims open pages (clients.claim), so fixes reach users without them having
// to fully close the app — the page reloads once on update (see registerSW; data is local-first,
// so nothing is lost). This replaced the old "wait for the page to allow it" flow, which left
// installed PWAs stuck on a stale build when the page never signalled.
// Offline store for the precached shell. The fetch handler is network-first, so routine asset changes
// reach returning visitors without touching this name. Bump it only when the SHELL list or the SW
// logic itself changes, to re-precache and clean up old caches on activate.
const CACHE = "baggo-shell-v11";
const SHELL = [
  "/", "/index.html", "/fonts.css?v=1", "/style.css?v=1", "/tokens.css?v=1", "/v2.css?v=1",
  "/db.js?v=1", "/sync.js?v=1", "/vendor/qr.js?v=1", "/app.js?v=1", "/baggo-mark.svg?v=1",
  "/fonts/PlusJakartaSans-latin.woff2",
  "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  // Take over as soon as we're installed, then cache the shell — don't wait for the page's say-so.
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  // Clean up old caches, then claim open pages so this version controls them immediately. The page's
  // controllerchange handler reloads once ONLY when it had a controller before (a real update), so a
  // first-time visitor is claimed silently and never interrupted mid-task (see public/app.js).
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
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
