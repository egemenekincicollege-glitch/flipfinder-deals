// Always load the newest version of the page when online (GitHub Pages lets phones cache files
// for 10 minutes, and home-screen apps sometimes longer). Falls back to the last copy when offline.
"use strict";
const CACHE = "flipfinder-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req, { cache: "no-store" })
      .then((resp) => {
        if (resp.ok) { const copy = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return resp;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
