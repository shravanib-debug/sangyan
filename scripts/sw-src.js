/* Thehrav service worker. scripts/generate-sw.mjs fills in the precache manifest and version.
   - Core PWA routes, static assets and the offline page are installed up front, so one
     successful load is enough to run the manual journey without a network.
   - Page navigations: network first (fresh when online), precached/last copy when offline.
   - API traffic is never handled here, so authenticated responses never enter Cache Storage.
   - Updates activate only when the page asks, which it never does during a pause. */
const MANIFEST = __MANIFEST__;
const VERSION = "__VERSION__";
const PRECACHE = `thehrav-precache-${VERSION}`;
const PAGES = "thehrav-pages";
const NETWORK_TIMEOUT_MS = 4000;
// Only real files are served as assets. Page routes (no file extension) are handled as navigations;
// their RSC data requests share the pathname and must go to the network, never to the cached HTML.
const ASSET_PATHS = new Set(
  MANIFEST.map((entry) => new URL(entry.url, self.location.origin).pathname).filter((path) => /\.[a-z0-9]+$/i.test(path))
);

importScripts("/push-sw.js");

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
});

async function precache() {
  const cache = await caches.open(PRECACHE);
  await Promise.all(
    MANIFEST.map(async (entry) => {
      const response = await fetch(new Request(entry.url, { cache: "reload" }));
      if (!response.ok) throw new Error(`precache_failed:${entry.url}`);
      await cache.put(entry.url, response);
    })
  );
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("thehrav-precache-") && name !== PRECACHE) await caches.delete(name);
      }
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(page(request, url));
  } else if (url.pathname.startsWith("/_next/static/") || ASSET_PATHS.has(url.pathname)) {
    event.respondWith(asset(request, url));
  }
});

async function precached(pathname) {
  return (await caches.open(PRECACHE)).match(pathname);
}

async function asset(request, url) {
  const hit = await precached(url.pathname);
  if (hit) return hit;
  const cache = await caches.open(PAGES);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function page(request, url) {
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    // Only successful, non-redirected HTML is kept as the offline copy.
    if (response.ok && !response.redirected) {
      const cache = await caches.open(PAGES);
      await cache.put(url.pathname, response.clone());
    }
    return response;
  } catch {
    const fallback =
      (await precached(url.pathname)) ||
      (await (await caches.open(PAGES)).match(url.pathname)) ||
      (await precached("/offline.html"));
    return fallback || Response.error();
  }
}
