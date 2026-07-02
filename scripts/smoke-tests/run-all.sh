#!/usr/bin/env bash
# ============================================================================
# Runtime Governance — multi-sector smoke-test pack
#
# Replays five realistic enterprise scenarios (finance, healthcare, cyber/MSSP,
# insurance, supply chain) through the live governance engine and generates the
# Audit + Executive Report PDFs for each.
#
# Usage:
#   GOVERNANCE_URL=http://127.0.0.1:8091 GOVERNANCE_TOKEN=... \
#     bash scripts/smoke-tests/run-all.sh
#
# Env:
#   GOVERNANCE_URL    base URL of the governance engine (/v1/assess, /v1/evaluate)
#   GOVERNANCE_TOKEN  bearer token for /v1/evaluate
#
# Outputs land under deliverables/<company-slug>-<period>/ (gitignored):
#   audit.pdf · audit.html/.md · executive-report.pdf · executive-report.html/.md
#   run-summary.json
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/../.."

: "${GOVERNANCE_URL:?set GOVERNANCE_URL to the engine base URL}"
: "${GOVERNANCE_TOKEN:?set GOVERNANCE_TOKEN to the engine bearer token}"

echo "== Preflight: auth + engine + Chromium =="
npm run audit:auth --silent || true
npm run audit:check --silent

echo
echo "== Fast verdict pre-flight (every trajectory vs expected) =="
python3 scripts/smoke-tests/_validate.py

echo
echo "== Full audits (PDF generation) =="
for f in scripts/smoke-tests/0*.json; do
  echo "---- $(basename "$f") ----"
  node scripts/delivery-kit.cjs "$f" | grep -A9 "Deliverables ("
done

echo
echo "== Done. Deliverables under ./deliverables/ =="
