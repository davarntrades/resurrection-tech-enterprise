#!/usr/bin/env bash
# One-time setup for the Delivery Kit. Idempotent — safe to re-run.
#   npm run audit:setup
set -e
cd "$(dirname "$0")/.."

echo "Resurrection Tech — Delivery Kit setup"

# 1) env file
if [ ! -f .env.delivery ]; then
  cp .env.delivery.example .env.delivery
  echo "  • created .env.delivery — add your GOVERNANCE_TOKEN"
else
  echo "  • .env.delivery present ✓"
fi

# 2) node deps
if [ ! -d node_modules ]; then
  echo "  • installing node deps …"; npm ci || npm install
else
  echo "  • node_modules present ✓"
fi

# 3) Chromium (best-effort; the kit also auto-discovers / accepts CHROME_BIN)
if node scripts/delivery-kit.cjs --check-chrome >/dev/null 2>&1; then
  echo "  • Chromium found ✓"
else
  echo "  • Chromium not found — attempting install …"
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq && (sudo apt-get install -y chromium || sudo apt-get install -y chromium-browser) || true
  elif command -v brew >/dev/null 2>&1; then
    brew install --cask chromium || true
  fi
  node scripts/delivery-kit.cjs --check-chrome || echo "    ↳ still missing — set CHROME_BIN=/path/to/chrome in .env.delivery"
fi

echo ""
echo "Done. Verify the engine:   npm run audit:check"
echo "Run an audit:              npm run audit -- --manifest customer-tools.json --name \"Acme Health\" --period \"May 2026\""
