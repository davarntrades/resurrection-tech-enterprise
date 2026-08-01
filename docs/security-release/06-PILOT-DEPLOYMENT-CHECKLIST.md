# Pilot Deployment Checklist

**Product:** Guardian OS — Morrison Runtime Governance™
**Version:** Post-audit, 1 August 2026
**Purpose:** The complete gate for a supervised enterprise pilot.

Every item is a gate. An item that cannot be checked is a blocker, not a
footnote. This checklist supplements — it does not replace —
`docs/PRODUCTION-DEPLOYMENT-CHECKLIST.md`, which covers baseline platform
configuration.

---

## Phase 1 — Code state

- [ ] **All six audit remediations merged** into the deployed build.
      Verify by commit, not by version number:

  | Finding | PR | Verify by |
  |---|---|---|
  | F-01 evidence-gap observability | #241 | `grep -c "submitEvidenceOrFlag" lib/runtime/integration-gateway.js` ≥ 1 |
  | F-02 canonical evidence hashing | #242 | `grep -c "sha256-canonical-v1" lib/runtime/integration-gateway.js` ≥ 1 |
  | F-03 append-only enforcement | #245 | `test -f supabase/evidence_append_only.sql` |
  | F-04 share hardening | #243 | `grep -c "scrypt\$" lib/runtime/deliverables.js` ≥ 1 |
  | F-05 calendar months | #244 | `node -e "const r=require('./lib/runtime/reports');console.log(r.windowFor('monthly',new Date('2026-06-15')).since)"` → `2026-06-01T00:00:00.000Z` |
  | F-06 report truncation | #246 | `npm run runtime:report-truncation` exits 0 |

- [ ] **Full validation suite green on the deployed commit:**
      `npm run contracts` and `npm run ops:test` both exit 0.

---

## Phase 2 — Database migrations

Apply in this order. Each is additive and idempotent.

- [ ] `supabase/governance_runtime.sql` — core `rg_*` tables, RLS, indexes
- [ ] `supabase/operations_agent.sql` — `rg_ops_*` tables
- [ ] `supabase/integration_gateway.sql` — connector tables
- [ ] `supabase/bedrock_invocation_runs.sql`, `communication_connector.sql`,
      `customer_support_workflow.sql` — connector run tables
- [ ] `supabase/connector_audit_projection.sql` — adds `rg_reports.connector_activity`
- [ ] `supabase/evidence_hash_canonical.sql` — adds `rg_integration_events.evidence_hash_alg`
- [ ] `supabase/evidence_append_only.sql` — **apply last**; needs all three
      evidence tables to exist

### Verify migrations

- [ ] **Tables and additive columns:**

  ```bash
  NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run ops:schema-check
  ```

  Must exit **0**. A non-zero exit means a surface will under-report rather
  than error (Remaining Known Risks R-5) — this is a blocker, not a warning.

- [ ] **Append-only triggers.** The schema check probes tables and columns over
      PostgREST and **cannot see triggers**. Verify directly in the SQL editor:

  ```sql
  select tgrelid::regclass as "table", tgname
  from pg_trigger
  where not tgisinternal and tgname like '%_no_update'
  order by 1;
  ```

  Expect exactly **three** rows: `rg_decisions`, `rg_integration_events`,
  `rg_ops_evidence`.

  > Do **not** verify by attempting an UPDATE against production evidence. A
  > `BEFORE UPDATE FOR EACH ROW` trigger does not fire when no row matches, so a
  > no-match probe reports a false negative — and a matching probe means writing
  > to a customer's evidence.

---

## Phase 3 — Fail-closed configuration

Both of these default to **off**. A pilot that omits them does not meet the
terms of the Production Readiness Statement.

- [ ] `RUNTIME_REQUIRE_RECORD=1` — a decision whose evidence cannot be recorded
      blocks instead of proceeding with `recorded:false`
- [ ] `RUNTIME_REQUIRE_DURABLE=1` — refuse to serve live traffic on the
      non-durable file store
- [ ] `GOVERNANCE_TOKEN` set (engine authentication)
- [ ] `RUNTIME_ADMIN_KEY` set (onboarding endpoint protection)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set
- [ ] `RUNTIME_RATE_LIMIT=<n>` considered — disabled unless set
      (`lib/runtime/ratelimit.js:15`)

- [ ] **Preflight passes:** `npm run runtime:preflight` exits **0**

---

## Phase 4 — Tenant and isolation posture

Organisation isolation is enforced in application code with **no active
row-level security policies** (Remaining Known Risks R-2). These items are the
compensating process control.

- [ ] **Tenants are named and known.** No self-serve onboarding during the pilot.
- [ ] **A second organisation exists in the target environment**, even if unused,
      so isolation is exercised rather than assumed.
- [ ] **Cross-tenant spot check performed:** for each read surface used by the
      pilot, confirm a request scoped to organisation A returns no organisation B
      records. Record the result.
- [ ] **Environment isolation confirmed:** each connector smoke targets its own
      environment. Verify from the environment record, not from configuration.

---

## Phase 5 — Evidence and enforcement proof

Do these against the pilot deployment before the customer relies on it.

- [ ] **Decision chain verifies:** `verifyChain()` returns `ok` for every
      environment in scope, with `broken_at: null`.
- [ ] **A deliberately blocked action is visible end to end.** Propose an action
      the catalog denies; confirm it is refused, that evidence exists, and that
      it appears in the monthly evidence pack. This is the end-to-end test of the
      property the product exists to provide.
- [ ] **Evidence hash verification reports no `mismatch`.** `unverifiable` is
      expected for any records predating the canonical-hash migration and is not
      a failure.
- [ ] **Generate a monthly pack and read it as an auditor would.** Confirm the
      register shows the genuinely most recent activity, that any truncation
      discloses itself with exact counts, and that no credential, token, prompt
      or customer content appears anywhere in it.
- [ ] **Generate `audit.pdf` and confirm it renders**, with the same content as
      the Markdown pack.

---

## Phase 6 — Operational readiness

- [ ] **Backup and recovery.** Supabase point-in-time recovery enabled, or the
      documented export set captured on a schedule. There is no scheduler,
      retention policy or automated restore verification in the product
      (`controls.js` CP-9, `partial`) — this is the operator's.
- [ ] **Alert routing.** Evidence-record failures raise alerts; confirm they
      reach a human.
- [ ] **Enforcement mode decided.** `shadow` observes; `enforce` blocks. Flip
      server-side per environment — `npm run runtime:set-mode -- <env> enforce`.
      Rollback is instantaneous and needs no redeploy.
- [ ] **Rollback rehearsed** at least once: `enforce → shadow → enforce`.
- [ ] **The customer has read** the Remaining Known Risks document and
      acknowledged R-1, R-2 and R-3 in writing.

---

## Phase 7 — Documentation handover

- [ ] Executive Security Assessment
- [ ] Technical Security Assessment
- [ ] Remediation Register
- [ ] Remaining Known Risks
- [ ] Production Readiness Statement
- [ ] Security Claims Matrix
- [ ] This checklist, completed and dated

---

## Sign-off

| Field | Value |
|---|---|
| Deployment / environment | |
| Deployed commit SHA | |
| Migrations applied (date) | |
| `ops:schema-check` exit code | |
| `runtime:preflight` exit code | |
| Append-only triggers present (3) | |
| `RUNTIME_REQUIRE_RECORD` | |
| `RUNTIME_REQUIRE_DURABLE` | |
| Cross-tenant spot check | |
| Blocked-action end-to-end proof | |
| Known risks acknowledged by customer | |
| Signed (operator) | |
| Signed (customer) | |
| Date | |

---

**A note on what this checklist is.** It is not a compliance formality. Six of
the seven phases exist because something in them was found to be wrong, absent,
or opt-in during the audit — the checklist is the audit's findings turned into
actions. An item skipped is a finding reintroduced.

---

*Companion documents: Executive Security Assessment, Technical Security
Assessment, Remediation Register, Remaining Known Risks, Production Readiness
Statement, Security Claims Matrix.*
