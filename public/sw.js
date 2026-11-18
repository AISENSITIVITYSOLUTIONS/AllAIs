// Service worker de AllAIs: hace la app instalable y muestra una página sin conexión.
// No guarda en caché la app ni las respuestas de la API: cada visita usa la versión
// publicada (los archivos ya llevan ?v= y Hosting controla su caché), así un deploy
// nunca deja a nadie con una versión vieja.
const OFFLINE_CACHE = "allais-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== OFFLINE_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Solo las navegaciones tienen respaldo: si no hay red, se muestra la página sin conexión.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(async () => {
    const cache = await caches.open(OFFLINE_CACHE);
    return (await cache.match(OFFLINE_URL)) || Response.error();
  }));
});
