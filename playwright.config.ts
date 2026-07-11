import { defineConfig, devices } from "@playwright/test";

/**
 * Production-style E2E for the Control Room, run against a real build (local
 * `next start` or the deployed site via E2E_BASE_URL). WebKit == Safari engine,
 * so it reproduces the iPad/iOS Safari behaviour we've been chasing.
 *
 *   E2E_BASE_URL=https://www.resurrection-tech.com \
 *   ADMIN_USER=… ADMIN_PASSWORD=… RUNTIME_ADMIN_KEY=… \
 *   npx playwright install webkit && npx playwright test
 */
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    ignoreHTTPSErrors: true,
    // HTTP Basic Auth for the /admin/* proxy (proxy.ts). Only applied when set.
    httpCredentials:
      process.env.ADMIN_USER && process.env.ADMIN_PASSWORD
        ? { username: process.env.ADMIN_USER, password: process.env.ADMIN_PASSWORD }
        : undefined,
  },
  projects: [{ name: "webkit", use: { ...devices["Desktop Safari"] } }],
});
