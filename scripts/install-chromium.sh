#!/usr/bin/env bash
# ============================================================================
# Install + verify Chromium for the Delivery Kit / Analyst Console.
# No-sudo-friendly: tries apt (best for headless libs) -> Playwright download
# -> Puppeteer. After each attempt it VERIFIES a real PDF render, and on
# success persists CHROME_BIN to .env.delivery so every later run + the console
# pick it up automatically. Idempotent — safe to re-run.
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

# 1) apt — pulls its own shared libraries, most reliable for headless rendering
if command -v apt-get >/dev/null 2>&1; then
  echo "  • trying apt-get (chromium) …"
  $SUDO apt-get update -qq >/dev/null 2>&1 || true
  $SUDO apt-get install -y chromium >/dev/null 2>&1 \
    || $SUDO apt-get install -y chromium-browser >/dev/null 2>&1 || true
  settle
fi

# 2) Playwright — downloads a known-good Chromium without sudo (deps may need sudo)
if command -v npx >/dev/null 2>&1; then
  echo "  • trying Playwright chromium download …"
  npx -y playwright install chromium >/dev/null 2>&1 || true
  $SUDO npx -y playwright install-deps chromium >/dev/null 2>&1 || true
  settle
fi

# 3) Puppeteer browsers — alternative no-sudo download
if command -v npx >/dev/null 2>&1; then
  echo "  • trying @puppeteer/browsers (chrome) …"
  npx -y @puppeteer/browsers install chrome@stable >/dev/null 2>&1 || true
  settle
fi

echo ""
echo "✗ Could not install a working Chromium automatically."
echo "  Manual fallback (Codespaces / Debian/Ubuntu):"
echo "    sudo apt-get update && sudo apt-get install -y chromium"
echo "    echo 'CHROME_BIN=/usr/bin/chromium' >> .env.delivery"
echo "  Then verify:  npm run audit:chrome"
exit 1
