import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([".next/**", "coverage/**", "public/sw.js", "apps/broker-worker/dist/**"]),
  {
    files: ["src/engine/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          "patterns": [
            "react",
            "react/*",
            "next",
            "next/*",
            "dexie",
            "@supabase/*",
            "@/features/*",
            "@/lib/*"
          ]
        }
      ],
      "no-restricted-properties": [
        "error",
        { "object": "Math", "property": "random", "message": "Inject a seeded RNG." },
        { "object": "Date", "property": "now", "message": "Inject time at the boundary." }
      ]
    }
  }
]);
