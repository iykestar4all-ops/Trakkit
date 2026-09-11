/* Trackit service worker — offline shell cache.
   Bump CACHE when files change to invalidate. */
const CACHE = "trackit-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./app.webmanifest",
  "./css/app.css",
  "./js/app.js",
  "./js/store.js",
  "./js/ui.js",
  "./js/screens.js",
  "./js/api.js",
  "./assets/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  // never cache the API — it is per-user and authoritative
  if (new URL(request.url).pathname.startsWith("/api/")) return;
  // network-first for same-origin navigation, cache-first for assets
  if (request.mode === "navigate") {
    e.respondWith(fetch(request).catch(() => caches.match("./index.html")));
    return;
  }
  e.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      const copy = res.clone();
      if (new URL(request.url).origin === location.origin) {
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => hit))
  );
});
