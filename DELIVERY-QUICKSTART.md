# Delivery Quickstart — run an audit in one command

Internal. Produces the branded **Audit PDF + Executive Report PDF + run-summary.json**
from a customer manifest, using the existing Runtime Governance engine + Delivery Kit.

## First time only (per environment)
```bash
npm run audit:setup     # creates .env.delivery, installs deps, finds/installs Chromium
# then edit .env.delivery and paste GOVERNANCE_TOKEN
npm run audit:check     # confirms engine + Chromium are ready
```

## Every audit — one command
With a customer's raw tool manifest file (JSON / YAML / TXT / Markdown / pasted):
```bash
npm run audit -- --manifest customer-tools.json \
  --name "Meridian Health Systems" --industry Healthcare \
  --period "May 2026" --reference RT-MHS-2026-05 \
  --domains healthcare,finance --open
```
…or with a prepared input file (see `scripts/delivery-kit.sample-healthcare.json`):
```bash
npm run audit -- customer.json
```

Output lands in `deliverables/<customer>-<period>/`:
- `audit.pdf` · `executive-report.pdf` · `run-summary.json`

The run prints a Priority-1 field matrix (✅/🔴) and the engine status, so you know
every section populated before you deliver. `--open` previews the audit PDF.

## Flags
`--manifest <file>` raw manifest · `--name` · `--industry` · `--period` · `--reference`
`--format` (generic|openai|mcp|…) · `--domains a,b` · `--trajectories <file>` ·
`--decisions <file>` · `--open` · `--check` · `--check-chrome`

## Notes
- `.env.delivery` and `/deliverables/` are gitignored (secrets + customer data).
- Reports are private until you choose to share them.
