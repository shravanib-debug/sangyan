import { defineConfig, devices } from "@playwright/test";

// E2E runs against the production build (the service worker only exists there):
//   npm run build && npx playwright test
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "html" : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "ci-placeholder-publishable-key",
      // Dummy values so the signed worker boundary can be exercised; no backend is contacted.
      SUPABASE_SERVICE_ROLE_KEY: "e2e-service-role-placeholder",
      BROKER_INTERNAL_SIGNING_KEY: "e2e-signing-key-e2e-signing-key-0123456789"
    }
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
