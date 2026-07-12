"use strict";
/* ============================================================================
 * Chromium smoke test — proves the report/PDF pipeline can launch a browser.
 *
 * Mirrors the exact runtime path report generation uses: resolve the binary via
 * scripts/lib/resolve-chromium.cjs (Playwright's managed Chromium / CHROME_BIN),
 * then shell out headless with --print-to-pdf and confirm a real PDF comes out.
 * No network, no report content — just: launch Chromium headlessly, exit clean.
 *
 *   npm run browser:smoke
 *
 * Exit 0 on success, 1 on failure (with a diagnostic + install hint).
 * ============================================================================ */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { resolveChromium, INSTALL_HINT } = require("../lib/resolve-chromium.cjs");

function fail(msg) {
  console.error(`✗ chromium smoke test FAILED\n  ${String(msg).replace(/\n/g, "\n  ")}`);
  process.exit(1);
}

let chrome;
try {
  chrome = resolveChromium();
} catch (e) {
  fail(e.message);
}

// 1) The binary must report a real browser version (not a snap stub).
let version = "";
try {
  version = execFileSync(chrome, ["--version"], { timeout: 15000, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
} catch (e) {
  fail(`Chromium at ${chrome} did not run --version: ${e.message}\n${INSTALL_HINT}`);
}
if (!/\b(chromium|chrome|google chrome)\b/i.test(version) || /snap/i.test(version)) {
  fail(`Resolved binary is not a usable Chromium (got: "${version}") at ${chrome}`);
}

// 2) Actually launch it headlessly and render a trivial page to PDF — the same
//    execFile shape the PDF pipeline uses. Clean up the temp file afterwards.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rt-chromium-smoke-"));
const pdf = path.join(tmpDir, "smoke.pdf");
const html = "data:text/html,<h1>Runtime Governance browser smoke test</h1>";
try {
  execFileSync(
    chrome,
    ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdf}`, html],
    { timeout: 60000, stdio: ["ignore", "ignore", "pipe"] },
  );
  const bytes = fs.readFileSync(pdf);
  if (bytes.length < 100 || bytes.subarray(0, 5).toString() !== "%PDF-") {
    fail(`Chromium launched but produced no valid PDF (${bytes.length} bytes) at ${pdf}`);
  }
  console.log("✓ chromium smoke test PASSED");
  console.log(`  binary:  ${chrome}`);
  console.log(`  version: ${version}`);
  console.log(`  render:  headless PDF ${bytes.length} bytes (valid %PDF header)`);
} catch (e) {
  fail(`headless launch/render failed: ${e.message}`);
} finally {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
}
process.exit(0);
