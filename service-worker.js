const CACHE_NAME = "daily-schedule-v43";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=34",
  "./script.js?v=26",
  "./src/css/tokens.css",
  "./src/css/base.css",
  "./src/css/buttons.css",
  "./src/css/layout.css",
  "./src/css/schedule.css",
  "./src/css/todo.css",
  "./src/css/dialogs.css",
  "./src/css/responsive.css",
  "./src/js/main.js",
  "./src/js/config.js",
  "./src/js/dom.js",
  "./src/js/time.js",
  "./src/js/storage.js",
  "./src/js/schedule.js",
  "./src/js/todo.js",
  "./src/js/modal.js",
  "./src/js/drag.js",
  "./src/js/pwa.js",
  "./manifest.webmanifest",
  "./icons/app-icon.svg",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok && new URL(event.request.url).origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => {
          if (event.request.mode === "navigate") return caches.match("./index.html");
          throw new Error("Offline resource unavailable");
        });
    }),
  );
});
