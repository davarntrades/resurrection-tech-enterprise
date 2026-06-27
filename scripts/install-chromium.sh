#!/usr/bin/env bash
# ============================================================================
# Install + verify Chromium for the Delivery Kit / Analyst Console.
# Tries Playwright (most reliable in Codespaces: bundled Chromium + system libs)
# -> apt -> Puppeteer. After each attempt it VERIFIES a real PDF render, and on
# success persists CHROME_BIN to .env.delivery so every later run + the console
# pick it up automatically. Output is shown (not hidden) so failures are
# diagnosable. Idempotent — safe to re-run.
#   npm run audit:chrome:install
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."
KIT="scripts/delivery-kit.cjs"

found() { node "$KIT" --print-chrome 2>/dev/null; }
verify() { CHROME_BIN="$1" node "$KIT" --selftest; }

persist() {
  local bin="$1"
  touch .env.delivery
  if grep -q '^[[:space:]]*CHROME_BIN[[:space:]]*=' .env.delivery 2>/dev/null; then
    sed -i.bak "s|^[[:space:]]*CHROME_BIN[[:space:]]*=.*|CHROME_BIN=$bin|" .env.delivery && rm -f .env.delivery.bak
  else
    printf 'CHROME_BIN=%s\n' "$bin" >> .env.delivery
  fi
  echo "  • CHROME_BIN=$bin saved to .env.delivery"
}

settle() {
  local bin; bin="$(found || true)"
  if [ -n "${bin:-}" ] && verify "$bin"; then persist "$bin"; echo "Chromium ready ✓"; exit 0; fi
}

echo "Resurrection Tech — Chromium install + verify"

# 0) already present and working?
settle

SUDO=""
if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then SUDO="sudo"; fi

# 1) Playwright — most reliable on Codespaces: downloads a known-good Chromium
#    and (with sudo) the system libraries it needs to render headless.
if command -v npx >/dev/null 2>&1; then
  echo "  • Installing Chromium via Playwright …"
  if [ -n "$SUDO" ]; then
    npx -y playwright install --with-deps chromium || true
  else
    npx -y playwright install chromium || true
  fi
  settle
fi

# 2) apt fallback (Debian; on Ubuntu 'chromium' may be a snap stub that won't run)
if command -v apt-get >/dev/null 2>&1; then
  echo "  • Trying apt-get chromium …"
  $SUDO apt-get update -y || true
  $SUDO apt-get install -y chromium || $SUDO apt-get install -y chromium-browser || true
  settle
fi

# 3) Puppeteer fallback — alternative download
if command -v npx >/dev/null 2>&1; then
  echo "  • Trying @puppeteer/browsers …"
  npx -y @puppeteer/browsers install chrome@stable || true
  settle
fi

echo ""
echo "✗ Could not install a working Chromium automatically."
echo "  Run this directly and paste any error you see:"
echo "    npx -y playwright install --with-deps chromium"
echo "  then verify:  npm run audit:selftest"
exit 1
