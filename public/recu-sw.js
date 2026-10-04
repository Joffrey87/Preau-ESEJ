// Service worker des reçus fiscaux : sert, depuis le navigateur seulement, le PDF qu'une page vient
// de générer (rangé dans le cache local « recu-local »), à une adresse qui porte son nom. Ainsi
// « Enregistrer » propose « Reçu fiscal 2026 - N°0207 - NOM Prénom.pdf » et non un nom anonyme.
// Aucune donnée ne transite par le serveur.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (!u.pathname.startsWith("/recu-local/")) return;
  e.respondWith(
    caches
      .open("recu-local")
      .then((c) => c.match(e.request))
      .then((r) => r || new Response("Ce reçu n'est plus disponible : régénérez-le depuis Préau.", { status: 404 })),
  );
});
