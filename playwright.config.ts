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
const VERCEL_BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: BASE,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Allow the browser context itself to enter protected Vercel preview deployments.
    // Values remain masked by GitHub Actions and are never printed by the test.
    extraHTTPHeaders: VERCEL_BYPASS
      ? {
          "x-vercel-protection-bypass": VERCEL_BYPASS,
          "x-vercel-set-bypass-cookie": "true",
        }
      : undefined,
    // HTTP Basic Auth for the /admin/* proxy (proxy.ts). Only applied when set.
    // send: "always" puts the Authorization header on the first request instead of
    // waiting to be challenged — the challenge-retry handshake is the flakier path
    // in WebKit, and a missed retry surfaces as the 401 body rendering as the page.
    httpCredentials:
      process.env.ADMIN_USER && process.env.ADMIN_PASSWORD
        ? { username: process.env.ADMIN_USER, password: process.env.ADMIN_PASSWORD, send: "always" }
        : undefined,
  },
  projects: [
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    // Local-only: validate the flow with a pre-installed Chromium when WebKit
    // can't be downloaded (set E2E_CHROMIUM to the chrome binary). Not used in CI.
    ...(process.env.E2E_CHROMIUM
      ? [{
          name: "chromium-local",
          use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: process.env.E2E_CHROMIUM } },
        }]
      : []),
  ],
});