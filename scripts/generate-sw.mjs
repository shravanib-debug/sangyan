import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import workboxBuild from "workbox-build";

const { getManifest } = workboxBuild;

// Routes that render without user-specific server data. Their prerendered HTML is
// precached so they open offline after the first load.
const OFFLINE_ROUTES = ["home", "onboarding", "pact", "checkin", "pause", "settings", "about", "login"];

const prerendered = join(".next", "server", "app");
const templatedURLs = {};
for (const route of OFFLINE_ROUTES) {
  const file = join(prerendered, `${route}.html`);
  if (existsSync(file)) templatedURLs[`/${route}`] = [file.replaceAll("\\", "/")];
}

// Workbox build tooling computes the manifest (URLs and content revisions); the worker itself is plain
// and dependency-free so it starts offline without extra runtime files.
const { manifestEntries, count, warnings } = await getManifest({
  globDirectory: ".",
  globPatterns: ["public/offline.html", "public/icons/*.{svg,png}", "public/push-sw.js", ".next/static/**/*.{js,css,woff2}"],
  globIgnores: ["**/node_modules/**"],
  modifyURLPrefix: { ".next/static/": "/_next/static/", "public/": "/" },
  templatedURLs,
  maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
});

const manifest = manifestEntries.map(({ url, revision }) => ({ url, revision }));
const serialized = JSON.stringify(manifest);
const version = createHash("sha256").update(serialized).digest("hex").slice(0, 12);

writeFileSync(
  "public/sw.js",
  readFileSync("scripts/sw-src.js", "utf8").replace("__MANIFEST__", () => serialized)
    .replace("__VERSION__", () => version)
);

for (const warning of warnings) console.warn(`workbox: ${warning}`);
console.log(`Service worker ${version}: ${count} precached files, ${Object.keys(templatedURLs).length}/${OFFLINE_ROUTES.length} offline routes.`);
