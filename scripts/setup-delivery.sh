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

# 3) Chromium — install + verify a real PDF render, persist CHROME_BIN
if node scripts/delivery-kit.cjs --selftest >/dev/null 2>&1; then
  echo "  • Chromium PDF rendering verified ✓"
else
  echo "  • Chromium missing/unverified — running installer …"
  bash scripts/install-chromium.sh || echo "    ↳ see messages above; set CHROME_BIN in .env.delivery if needed"
fi

echo ""
echo "Done. Verify the engine:   npm run audit:check"
echo "Run an audit:              npm run audit -- --manifest customer-tools.json --name \"Acme Health\" --period \"May 2026\""
