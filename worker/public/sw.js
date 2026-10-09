// The Worker stamps VERSION with the deployed commit when serving this file,
// so every deploy is a byte-different service worker: that is what makes
// browsers find the update and the page offer it (#177).
const VERSION = "__DEPLOY__";
const CACHE = `pricedb-${VERSION}`;
const SHELL = ["/", "/manifest.webmanifest", "/pwa.js", "/icons/icon-192.png"];
// Writes or third-party integrations; never cache or replay them
const BYPASS = ["/mcp", "/telegram/"];

self.addEventListener("install", (event) => {
  // No skipWaiting here: the page asks the user before switching versions
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("pricedb-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
  // Lets a page (and the end-to-end test) ask which deploy is running
  if (event.data === "version") (event.ports[0] ?? event.source)?.postMessage({ version: VERSION });
});

// Network first, so prices are never older than the network allows; the cache
// only answers when offline
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin || BYPASS.some((path) => url.pathname.startsWith(path))) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
        }
        return response;
      })
      .catch(async () => (await caches.match(request)) ?? (request.mode === "navigate" ? caches.match("/") : Response.error()))
  );
});
