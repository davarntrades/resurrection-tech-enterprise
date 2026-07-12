"use strict";
/* ============================================================================
 * Chromium resolution — single source of truth for the report / PDF pipeline.
 *
 * Report generation shells out to a Chromium BINARY (execFileSync … --headless
 * --print-to-pdf). This helper decides WHICH binary, using Playwright's managed
 * Chromium — the same browser `npm run browser:install` downloads — so the path
 * is identical and reproducible across GitHub Codespaces, local development, CI,
 * and supported deployment environments.
 *
 * Resolution order (deliberately NO apt / snap / Codespace-specific paths):
 *   1. CHROME_BIN — explicit operator override (e.g. a deploy image that ships
 *      its own Chrome). Must point at a real binary.
 *   2. Playwright's managed Chromium — chromium.executablePath(). This honours
 *      PLAYWRIGHT_BROWSERS_PATH and is revision-proof: it always returns the
 *      revision Playwright actually installed (e.g. chromium-1228/…), so a
 *      Playwright upgrade never leaves a stale hard-coded path behind.
 *
 * Requires the Playwright browser to be installed once (`npm run browser:install`
 * → `playwright install chromium`). `playwright-core` (a transitive dependency
 * of the declared `@playwright/test`) carries the locator; the full `playwright`
 * package is tried as a fallback.
 * ============================================================================ */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const existing = (p) => { try { return p && fs.existsSync(p) ? p : null; } catch { return null; } };

/** Playwright's own browser-cache dirs (managed browsers only — no apt/snap). */
function playwrightCacheDirs() {
  return [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(os.homedir(), ".cache", "ms-playwright")].filter(Boolean);
}

/**
 * Scan Playwright's browser cache for an installed chromium build. Revision-
 * agnostic, so it still resolves when the provisioned browser's revision differs
 * from the one this Playwright build defaults to (e.g. a pre-provisioned
 * Codespace image). Newest revision first.
 */
function scanPlaywrightCache() {
  for (const base of playwrightCacheDirs()) {
    let dirs = [];
    try { dirs = fs.readdirSync(base).filter((d) => /^chromium/.test(d)).sort().reverse(); } catch { continue; }
    for (const d of dirs) {
      const cand = [
        path.join(base, d, "chrome-linux64", "chrome"),
        path.join(base, d, "chrome-linux", "chrome"),
        path.join(base, d, "chrome-linux", "headless_shell"),
        path.join(base, d, "chrome-headless-shell-linux64", "chrome-headless-shell"),
        path.join(base, d, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
      ];
      for (const c of cand) if (existing(c)) return c;
    }
  }
  return null;
}

/** Path to Playwright's managed Chromium, or null if not installed/resolvable. */
function playwrightChromium() {
  // 1. The exact revision this Playwright build expects.
  for (const mod of ["playwright-core", "playwright"]) {
    try {
      const p = existing(require(mod).chromium.executablePath());
      if (p) return p;
    } catch { /* module or browser absent — try the next */ }
  }
  // 2. Any chromium build already present in Playwright's cache (handles a
  //    provisioned browser whose revision differs from this build's default).
  return scanPlaywrightCache();
}

const INSTALL_HINT =
  "No Playwright-managed Chromium found.\n" +
  "  Install it once:   npm run browser:install        (playwright install chromium)\n" +
  "  In CI:             npx playwright install --with-deps chromium\n" +
  "  Or override:       CHROME_BIN=/path/to/chrome";

/**
 * Resolve the Chromium executable for report/PDF generation.
 * @param {{required?: boolean}} [opts] required (default true) → throw with an
 *        install hint when nothing is found; false → return null instead.
 * @returns {string|null} absolute path to a Chromium binary.
 */
function resolveChromium({ required = true } = {}) {
  const override = process.env.CHROME_BIN;
  if (override && fs.existsSync(override)) return override;

  const managed = playwrightChromium();
  if (managed) return managed;

  if (!required) return null;
  throw new Error(INSTALL_HINT);
}

module.exports = { resolveChromium, playwrightChromium, INSTALL_HINT };
