import { generateSW } from "workbox-build";

const result = await generateSW({
  globDirectory: ".",
  globPatterns: ["public/offline.html", "public/icons/*.{svg,png}", ".next/static/**/*.{js,css,woff2}"],
  globIgnores: ["**/node_modules/**"],
  swDest: "public/sw.js",
  navigateFallback: "/offline.html",
  navigateFallbackDenylist: [/^\/api\//, /^\/_next\//],
  cleanupOutdatedCaches: true,
  clientsClaim: false,
  skipWaiting: false,
  inlineWorkboxRuntime: true,
  maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
  runtimeCaching: [
    {
      urlPattern: ({ request }) => request.mode === "navigate",
      handler: "NetworkFirst",
      options: {
        cacheName: "thehrav-pages",
        networkTimeoutSeconds: 4,
        expiration: { maxEntries: 24, maxAgeSeconds: 24 * 60 * 60 }
      }
    },
    {
      urlPattern: ({ url }) => url.pathname.startsWith("/_next/static/"),
      handler: "StaleWhileRevalidate",
      options: { cacheName: "thehrav-static" }
    }
  ]
});

console.log(`Generated service worker with ${result.count} precached files.`);
