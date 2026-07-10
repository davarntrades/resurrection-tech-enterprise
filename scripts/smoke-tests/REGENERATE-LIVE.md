# `regenerate-live.sh` — live deliverable regeneration + publish

One command to regenerate a customer's **branded executive deliverables** from
the **live deployed engine** and publish them through the durable Audit Pack
workflow — fail-closed at every step. It orchestrates the existing tooling
(`delivery-kit.cjs`, `enterprise-regression.cjs`, `_validate.py`,
`publish-audit.cjs`); it does not reimplement any of them.

> Run this from a Codespace / console that can reach the deployed engine. It is
> intentionally **not** runnable from a locked-down sandbox where the engine
> host is egress-blocked.

## Usage

```bash
# 1) Configure once (secrets live here; the file is gitignored):
cp .env.delivery.example .env.delivery
#   set GOVERNANCE_URL + GOVERNANCE_TOKEN (deployed engine)
# 2) Ensure Supabase durable-store creds are present (env or .env.production):
#   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

# find the target org/env ids:
node scripts/runtime/publish-audit.cjs --list-envs

# dry run — validate config, paths, secrets presence, Chromium (no engine calls):
bash scripts/smoke-tests/regenerate-live.sh \
  --pack scripts/smoke-tests/01-finance-meridian-sterling.json \
  --org <org_id> --env <env_id> --dry-run

# real run — regression → generate PDFs → provenance check → publish:
bash scripts/smoke-tests/regenerate-live.sh \
  --pack scripts/smoke-tests/01-finance-meridian-sterling.json \
  --org <org_id> --env <env_id> \
  --name "48-Hour Runtime Governance Audit" --reference RT-MSB-2026-07
```

## Arguments

| Flag | Required | Default | Meaning |
|---|---|---|---|
| `--pack`, `--customer` | yes | — | Customer smoke-test pack (`.json`) |
| `--org` | yes | — | Target organisation id |
| `--env` | yes | — | Target environment id |
| `--name` | no | `48-Hour Runtime Governance Audit` | Audit pack name |
| `--reference` | no | pack's `customer.reference` | Pack reference |
| `--style` | no | `editorial` | `editorial` (premium branded house style) or `dark` |
| `--dry-run` | no | — | Validate + print plan; no engine calls, writes, or publish |
| `--help` | no | — | Usage |

## What it guarantees

1. Loads `.env.delivery` + `.env.production` **without printing secrets**.
2. Fails immediately if `GOVERNANCE_URL`, `GOVERNANCE_TOKEN`,
   `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `--org`, `--env`,
   the pack file, or a usable Chromium is missing.
3. Verifies connectivity (`/health` 200) **and** token validity (a `/v1/evaluate`
   probe: `200` accept / `401` reject).
4. Records the deployed engine commit + service version from `/health`.
5. Runs the full **live** enterprise regression (every sector pack + replay +
   baseline gate).
6. Refuses to continue if the regression **skipped** live, or reported any
   **false positive / false negative**, or failed.
7. Generates the branded Chromium set: `audit.pdf`, `executive-report.pdf`,
   `audit.html`, `executive-report.html`, `run-summary.json` (+ `.md`).
8. Verifies each expected file exists, is non-empty, and both PDFs are valid
   (`%PDF` header + `EOF` trailer).
9. Verifies `run-summary.json` provenance (`mode=live`, `metrics.source=engine`,
   `status.assess/evaluate=true`, deterministic replay) and that its
   `attestation.engine_commit` **matches** the deployed `/health` commit.
10. Publishes to the org/env via the **durable Supabase** Audit Pack path
    (aborts if the store resolves to the non-durable file backend).
11. Prints a concise summary: customer, period, trajectory count,
    ALLOW/ESCALATE/BLOCK, false positives/negatives, replay status, engine
    commit, output dir, published pack id, and the Control Room path.

## Safety properties

- `set -Eeuo pipefail` with a cleanup/error trap.
- **No secret** (token, service-role key, password) is ever echoed.
- Generated customer deliverables (`deliverables/`) are **gitignored** and never
  committed.
- The committed `VALIDATION-REPORT.md` is only left updated if the live
  regression **succeeded**; otherwise it is restored from backup.
- **No HTML-only fallback**: if PDF generation fails, the run aborts — it never
  publishes a pack without valid PDFs. Fix the pipeline instead.
- Idempotent where practical: the pack's output directory is cleared and
  regenerated on each run.

## Tests

Hermetic argument-validation + secret-redaction tests (no engine, no publish):

```bash
bash scripts/smoke-tests/regenerate-live.test.sh
```
