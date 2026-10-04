// Ancien service worker des reçus fiscaux, abandonné : il se désinscrit seul et vide son cache.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(
    (async () => {
      await caches.delete("recu-local");
      await self.registration.unregister();
    })(),
  ),
);
