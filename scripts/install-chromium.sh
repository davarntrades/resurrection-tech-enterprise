#!/usr/bin/env bash
# ============================================================================
# Install + verify Playwright's managed Chromium for the report / PDF pipeline.
#
# Playwright-only: NO apt, NO snap, NO Codespace-specific paths. The browser is
# resolved at runtime by scripts/lib/resolve-chromium.cjs via
# chromium.executablePath(), so this script only has to make sure Playwright's
# Chromium is downloaded. Idempotent — safe to re-run.
#
#   npm run browser:install       # bare download: playwright install chromium
#   npm run audit:chrome:install  # this script: download + render self-test
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

echo "Resurrection Tech — Chromium (Playwright-managed) install + verify"
echo "  commit:     $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "  codespaces: ${CODESPACES:-false}"
echo "  browsers:   ${PLAYWRIGHT_BROWSERS_PATH:-<default ms-playwright cache>}"

# Download Playwright's Chromium. --with-deps also installs the system libraries
# it needs to render headless, when we can elevate (CI / sudo present); the
# browser binary itself needs no root, so fall back to a plain download.
if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
  echo "  • playwright install --with-deps chromium (sudo available)"
  npx --yes playwright install --with-deps chromium
else
  echo "  • playwright install chromium"
  npx --yes playwright install chromium
fi

# Verify by resolving + rendering a real PDF headlessly (the actual runtime path).
if node scripts/smoke-tests/chromium-smoke.cjs; then
  echo "Chromium ready ✓"
  exit 0
fi

echo ""
echo "✗ Chromium downloaded but the headless render self-test failed."
echo "  Retry with system libraries:  npx playwright install --with-deps chromium"
echo "  CI tip: run on the official Playwright image (mcr.microsoft.com/playwright)"
echo "          or a runner that permits the Playwright system dependencies."
exit 1
