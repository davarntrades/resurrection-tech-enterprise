# Independent audit findings: reproduction, repair and regression

- **Scope:** enterprise deployment `ddd1f55` (PR #294), governance engine `f25d300`
- **Branch:** `claude/independent-audit-repairs` (base `ddd1f55`). Not merged, not deployed.
- **Date:** 2026-11-10

> **Every result here is local or production-equivalent, not hosted production.**
> "Production-equivalent" means the real local governance service on engine
> `f25d300`, the real gateway and store, and a disposable Postgres 16 whose
> `rg_decisions` and `rg_chain_heads` were generated from production's column
> metadata (production runs Postgres 17.6). Execution used the inert recorder
> adapter only. No migration was applied to production. Nothing was deployed.
> No secret was read, printed, rotated or changed.

## 0. Limits of this work

1. **The independent assessment and its 34 evidence items could not be found.**
   I searched both repositories, Google Drive and Gmail. Each finding was
   reproduced from its description in the brief. This matrix cannot be
   cross-referenced to evidence item numbers until the assessment is supplied.
2. **The baseline test count differs.** The brief's "359 passed / 7" could not
   be located. Measured at `ddd1f55`, the governance-service pytest gives 70
   passed. Section 4 has every baseline measured.
3. **Production contact.**
   - Read-only metadata queries against the production Supabase project:
     column types, the table list, `to_json(timestamptz)` format, and aggregate
     row counts for `rg_decisions`. No row contents were read.
   - One `GET /health` against the production engine. It reports which secrets
     are configured as booleans, never their values.
   - **Unintended:** early in this work one gateway test run started without
     `GOVERNANCE_URL` set. The gateway therefore defaulted to the production
     engine (`HOSTED_DEFAULT`) and sent about 10 unauthenticated requests. All
     were refused with HTTP 401, and no decision was made or recorded. Every
     later run pinned a loopback URL. The new e2e script refuses non-loopback
     engines.

## A. Reproduction matrix

| ID | Finding | Status | Reproduced at | Command | Failing test(s) on original | Root cause | Severity | Evidence |
|---|---|---|---|---|---|---|---|---|
| A | Malformed or unknown engine verdicts become ALLOW | **REPRODUCED** | `ddd1f55` | `node scripts/runtime/verdict-failclosed.test.cjs` | 56 of 196 checks fail. In enforce mode, 15 cases return ALLOW **and the execution gate issues a grant**: NOT_ALLOWED, DISALLOWED, NOT_PERMITTED, UNPERMITTED, PERMIT_PENDING, array verdict, `strictest_verdict` PERMIT over BLOCK, malformed `strictest_verdict`, local BLOCK vs PERMIT, global BLOCK vs PERMIT, malformed global, **[BLOCK, PERMIT] reported as PERMIT**, malformed per-step verdict, `blocked:true` with PERMIT, `permitted:false` with PERMIT. FOO, UNKNOWN, TRUE, `1` and `[OBJECT OBJECT]` were recorded as verdicts. An engine-client exception made `govern()` throw. In shadow mode, 15 cases reported would-be ALLOW. | `normVerdict` matched substrings (`/PERMIT\|ALLOW/` matches NOT_ALLOWED) and passed unknown strings through. `strictest_verdict` overrode `verdict`. Per-step, local and global verdicts and flags were never cross-checked. | **Critical** if the engine response is faulty, version-skewed or tampered with. The real `f25d300` engine emits well-formed verdicts (812 decisions checked), so exploitation needs control of, or a defect in, the engine response path. | `lib/runtime/gateway.js` at `ddd1f55` lines 31–37 and 127/153 |
| B | `trajectory_hash` does not bind the trajectory | **REPRODUCED** | `ddd1f55` + engine `f25d300` | `cd governance-service && PYTHONPATH=<engine f25d300> python -m pytest -q test_trajectory_hash_binding.py` | 13 of 14 fail. `[read_file, rm -rf /]` and `[summarize, rm -rf /]` both hash to `487061fe…`. `/v1/evaluate` returns a 16-hex `edb7f4e4…` for the same input. `gateway.test.cjs` and `hardening.test.cjs` fail "exact replay proves determinism". | `/v1/govern` set `trajectory_hash` to the terminal step's `action_hash`, and `/v1/evaluate` returned the engine's internal state hash under the same name. | **High.** Evidence cannot show which trajectory was decided, and replay can never verify. | `governance-service/app.py` at `ddd1f55` line 872 |
| C | Production DB lacks `shadow_observed_only` | **REPRODUCED** against the production schema (metadata), not against hosted production | `ddd1f55` | `PG_SOCKET=… PG_DATABASE=… node scripts/runtime/persistence-schema.test.cjs` | 13 of 26 fail: 0 rows persisted, enforce PERMIT returned BLOCK (all enforce traffic fails closed), shadow not recorded. Postgres: `column "shadow_observed_only" of relation "rg_decisions" does not exist`. | The gateway writes `shadow_observed_only` on every decision. No migration creates it, and it was missing from `ADDITIVE_EVIDENCE_FIELDS`, so the additive-field retry failed too. | **Critical (availability and evidence).** Enforce blocks everything; shadow evidence is lost. | Production `rg_decisions`: 46 columns, none named `shadow_observed_only`. The last row is dated 2026-07-11 (6 rows in total). |
| C2 | Hash chain cannot verify on Supabase (found while reproducing C) | **REPRODUCED** (pre-existing; not in the brief) | `ddd1f55` | `node scripts/runtime/chain-timestamptz.test.cjs` (no DB needed); also `persistence-schema.test.cjs` | `verifyChain` returns `entry_hash_mismatch` at seq 1 for every chain read back from Postgres. | `created_at` is hashed as JS ISO `…37.960Z`, but the `timestamptz` column reads back as `…37.96+00:00`. This format was confirmed on the production project with `to_json`. | **High.** Every Supabase-backed integrity check reports INTEGRITY_FAILED, so tampering cannot be told apart from a working system. | Production: `created_at` is `timestamp with time zone`; `TimeZone` is UTC. |
| C3 | Additive retry discards evidence the schema has | **REPRODUCED** | `ddd1f55` | `persistence-schema.test.cjs` | After the C fix alone, shadow rows lost `would_be_verdict` and `record_mac`. | One missing column made the retry strip **all** additive fields. | **Medium** (evidence loss) | `lib/runtime/store.js` `appendDecision` |
| D1 | Engine missing `GOVERNANCE_GATEWAY_SECRET` / evidence key | **NOT REPRODUCED in production** | production engine `/health` | `curl …/health` (booleans only) | n/a. Production reports `degraded:false`, `missing_required:[]`, `gateway_identity_enforced:true`, `evidence_sealing_enabled:true`, `evidence_key_is_approval_key_fallback:false`, and `production:true`. | The code path exists: with no secret, `_resolve_identity` accepts the identity headers as `unauthenticated_header`. Production refuses to boot without the secret unless `GOVERNANCE_ALLOW_INSECURE_STARTUP` is set, and it is not. | n/a (hardening note in section B) | `secrets` block of production `/health` |
| D2 | Vercel gateway missing `GOVERNANCE_GATEWAY_SECRET` / `RUNTIME_EVIDENCE_KEY` | **INCONCLUSIVE** | n/a | no Vercel access from this environment | Not testable. Production has no `rg_decisions` row written since the MAC code shipped (both arrived in `ddd1f55`), so rows cannot show whether the key is set. | n/a | Unknown | See section C.4 for metadata-only checks |
| D3 | Preview and production share credentials | **INCONCLUSIVE** (code-level contributing factor confirmed) | `ddd1f55` | n/a | The engine URL defaults to the **production** engine when `GOVERNANCE_URL` is unset: `lib/runtime/engine.js:12`, `lib/governance-client.ts:63`, `lib/frontier-server.ts:3`, `scripts/delivery-kit.cjs:53`. A preview build without `GOVERNANCE_URL` therefore talks to production. Whether preview holds production's token is not visible from here. | Hard-coded production default | Unknown; potentially **High** | Section C.4 |
| E1 | npm dependency vulnerabilities | **REPRODUCED** | `ddd1f55` lockfile | `npm audit --json` | 23 total: 1 critical, 8 high, 10 moderate, 4 low | See section B, Finding E | **Critical** (`next` 16.2.6, direct, reachable) | `npm audit` output |
| E2 | Python dependency vulnerabilities | **REPRODUCED**, **not repaired** | `governance-service/requirements.txt` | `pip-audit -r governance-service/requirements.txt` | 14 advisories, all in `starlette` 0.41.3 (transitive via `fastapi==0.115.6`) | The `fastapi` pin holds `starlette<0.42`. | **Medium.** The vulnerable features are not used by application code. | Section B |
| N | Numeric-parser interaction (negative, boolean or malformed amounts; approval-cap bypass) | **No bypass reproduced**; integration work identified | engine `f25d300` | `python3 scripts/testing/numeric-amount-probe.py 8787 8788` (19 amounts × 2 tools × 2 local engines, fresh principal per request) | On `f25d300`, string, `null`, list and object amounts on `transfer_funds` hit `excessive_amount` and raise `TypeError`, which fails closed to BLOCK by error handling, not by policy. Negative, zero and boolean amounts ESCALATE (`payment.move_funds` / `unauthorized_transfer`). **The only PERMITs on either engine are the well-formed amounts 50 and 500**, plus the decimal string `"500"` on the combined engine, which is the same value. | `excessive_amount` compares raw values (`domains.py:111`). Auto-approval in `f25d300` (`_payment_amount`) already rejects booleans, non-finite values, values ≤ 0 and disagreeing aliases. | Low (fails closed) | `docs/audit-evidence/numeric-interaction.txt` |

## B. Repair report

### Finding A: verdicts fail closed
- **Expected:** in enforce mode, an unknown, malformed, contradictory or
  unavailable decision is BLOCK and never yields an execution grant. Shadow
  mode never reports a would-be ALLOW for one, and never interrupts the
  caller.
- **Observed:** see the matrix.
- **Repair** (`lib/runtime/gateway.js`):
  - `parseVerdict` uses an exact token table: PERMIT/ALLOW → ALLOW;
    ESCALATE/HUMAN_REVIEW/REVIEW → ESCALATE; BLOCK/DENY → BLOCK; anything
    else → `null`.
  - `readEngineDecision` requires a plain object with a verdict, then parses
    `verdict`, `strictest_verdict`, local, global and authorization verdicts,
    and every step's verdicts.
  - Any unparseable verdict marks the decision malformed. Otherwise the
    effective verdict is the **strictest** of all of them.
  - Flags must be booleans. `blocked:true` forces BLOCK, `escalated` forces at
    least ESCALATE, and `permitted:false` with ALLOW is malformed.
  - A malformed decision is recorded as `MALFORMED_ENGINE_DECISION` with
    `evaluation_failed`, and fails closed like an unavailable engine.
  - An engine-client exception becomes an unavailable engine instead of a
    throw. The old `strictest_verdict` override is removed.
  - Engine fields are echoed to the caller only from a well-formed decision.
- **Unchanged:** strictest-verdict precedence, veto, the shadow/enforce
  semantics, and the execution gate (`contract.js`).
- **Tests:** `scripts/runtime/verdict-failclosed.test.cjs`. Original: 140
  passed, 56 failed. Repaired: 201 passed, 0 failed. This covers 28 fail-closed
  and 5 well-formed cases in both modes, plus gate-grant checks that bind
  exactly as production does.

### Finding B: trajectory binding
- **Repair:** `governance-service/app.py` and `lib/runtime/gateway.js`, as
  specified in [`docs/EVIDENCE-BINDING.md`](EVIDENCE-BINDING.md).
- **Tests:** `governance-service/test_trajectory_hash_binding.py`. Original: 1
  passed, 13 failed. Repaired: 14 passed.

### Finding C: persistence on the production schema
- **Migration:** `supabase/decision_evidence_v3.sql` adds nullable
  `shadow_observed_only`, `decision_binding_hash`, `deciding_action_hash` and
  `trajectory_hash_schema` columns. It is idempotent, has no backfill (the
  table is append-only), and leaves the chain and MAC payload untouched.
- **Store:** these fields are additive. On a missing-column error the store
  drops **only the column the database names**. It parses both Postgres
  `column "x" of relation` and PostgREST `Could not find the 'x' column`, and
  falls back to dropping every additive field only if no column is named. The
  gap is still reported via `pendingMigrations()`.
- **C2:** `verifyChain` accepts the stored `created_at` string or **the same
  instant** in the writer's canonical ISO form. `chainCore` is unchanged, so no
  historical hash changes. A changed instant or an unparseable value still
  fails.
- **Tests:**
  - `scripts/runtime/persistence-schema.test.cjs` (disposable Postgres built
    from production column metadata). Original: 13 passed, 13 failed.
    Repaired: 26 passed, 0 failed. It covers:
    - both modes;
    - store outage with no partial write (enforce fails closed, shadow
      reports the gap);
    - migration apply and re-apply;
    - restart;
    - chain continuity;
    - keyed verification;
    - tamper detection.
  - `scripts/runtime/chain-timestamptz.test.cjs` needs no DB and runs in CI.
    Original store: fails the round-trip, and the parser does not exist.
    Repaired: 8 passed.

### Finding D: secrets and isolation
- **No code repair.** D1 did not reproduce in production. D2 and D3 are
  inconclusive without Vercel metadata, and the brief says not to invent a
  repair.
- **Hardening recommendations, not implemented, for a decision:**
  1. In `_resolve_identity`, when `_is_production()` and no gateway secret is
     set, return anonymous instead of `unauthenticated_header`. This makes the
     runtime match its own docstring, even under
     `GOVERNANCE_ALLOW_INSECURE_STARTUP`.
  2. Remove the production default URL from the four call sites listed in D3
     when `VERCEL_ENV !== "production"`, so preview fails closed instead of
     reaching production.
- **Remediation:** section C.4.

### Finding E: dependencies
- **npm, repaired with targeted in-range changes only:**
  - `next` ^16.2.6 → **^16.4.6**. This fixes the critical advisories,
    including unauthenticated RCE in the Image Optimization API and in
    `next/og` (both features are used: `app/live-demo/opengraph-image.tsx` and
    `images` config), SSRF and cache poisoning.
  - `postcss` ^8.5.1 → **^8.5.32**.
  - `npm audit fix` without `--force`: transitive `brace-expansion`,
    `js-yaml`, `nanoid`, `browserslist`, `source-map-js`, `sharp` 0.35.5,
    `postcss-selector-parser` and `baseline-browser-mapping`.
  - Result: **23 → 13** (0 critical, 1 high, 8 moderate, 4 low).
  - `tsc --noEmit`: 0 errors. `next build`: succeeds.
- **npm, remaining (each needs a major bump, so not done here):**
  - `zod` 3.25.76 (high, direct; fix only in 4.6.7). It is reachable:
    constrained arrays and records on `app/api/frontier/session` and
    `app/api/payments/create`. **Recommend** a separate zod 4 migration, or a
    request-size cap on those routes meanwhile.
  - `eslint-config-next` / `typescript-eslint` / `minimatch` (moderate,
    dev-only lint tooling).
  - `resend` / `html-to-text` / `deepmerge` (low; email rendering of
    server-controlled content).
- **Python, not repaired:** `starlette` 0.41.3 has 14 advisories, including
  multipart DoS, a Range-header quadratic, Host/path URL reconstruction,
  Windows `StaticFiles`, `HTTPEndpoint` method dispatch and form limits.
  - The fixes need `starlette` ≥ 1.3.1, which means a FastAPI upgrade of the
    service framework.
  - Application code uses no forms or multipart, no `StaticFiles` or
    `FileResponse`, no `HTTPEndpoint` and no `request.url`.
  - **Recommend** a scheduled FastAPI/starlette upgrade with its own
    regression run.

### Numeric parser (branch `claude/fix-excessive-amount-typeerror` @ `6e6205d`, Morrison repo): interaction
- `6e6205d` is cut from `06b9b55`, and engine `f25d300` is 21 commits ahead of
  it on no remote branch. **Neither was merged here, and PR #47 is untouched.**
- A trial cherry-pick onto `f25d300`, in a scratch worktree and never pushed,
  conflicts in:
  - `kernel/gate.py`: `f25d300`'s `_payment_amount` already supersedes the
    branch's auto-approval change, so keep `f25d300`'s side;
  - `README.md` and `limits_audit/evidence/facts.json`: the published test
    count.
- Combined result: 1547 passed, 10 skipped, 1 failed. The failure is the
  published count, 2,146 → 2,261. No existing test changed status.
- **Combined behaviour** (isolated, deterministic):
  - The `TypeError` fail-closed results become named-rule decisions
    (`malformed_amount`, `excessive_amount`).
  - Negative and boolean amounts BLOCK as malformed.
  - No hostile amount is PERMITted.
- **Probe isolation matters.** The engine keeps per-principal history: the
  `fraud_split_transfer` pattern rule counts earlier small transfers. A first
  probe run that reused one principal showed history-dependent verdicts,
  including a spurious string/number divergence on `send_payment "500"`.
  The committed probe uses a fresh principal per request, and two
  consecutive runs on fresh engines are identical.
- **Integration work:**
  1. Rebase `6e6205d` onto `f25d300`'s lineage, keeping `_payment_amount`.
  2. Make `_payment_amount` use `numeric.parse_number`, which rejects
     exponents (`"1e2"`) and underscores (`"1_000"`) that `float()` accepts.
     Both still accept non-ASCII digits (`"١٠٠"` → 100) and surrounding
     whitespace. Decide whether amounts should be ASCII-only, since a
     JavaScript executor reads `Number("١٠٠")` as `NaN`.
  3. Update the published count.
  4. Bump `ENGINE_REF` in `governance-service/Dockerfile`.
  5. Rerun this probe and the enterprise regression.

## C. Deployment and migration plan (each step needs your approval)

### C.1 Order and reasons
1. **Production Supabase:** apply `supabase/decision_evidence_v3.sql`. It is
   additive and idempotent, and safe for the currently deployed gateway: it
   *creates* the column whose absence makes every write fail.
2. **Only if governed execution is meant to run in production:** apply
   `supabase/universal_governed_execution.sql`, then
   `supabase/pilot_modes_evidence_v2.sql`. Production has no
   `rg_execution_records` table, so `governAndExecute` currently fails closed
   with `EXECUTION_EVIDENCE_UNAVAILABLE`.
3. **Vercel:** deploy the gateway from this branch (it includes `next`
   16.4.6). It must go **before** the engine. The new gateway records
   `trajectory_hash_schema` only when the engine sends it. Deploying the engine
   first would let the old gateway store new-semantics hashes with no schema,
   mislabelled as legacy.
4. **Railway:** deploy the governance service (`app.py` change; `ENGINE_REF`
   unchanged at `f25d300`).

### C.2 Rollback
- **Gateway:** use Vercel instant rollback to the `ddd1f55` deployment. After
  step 1, that gateway works too, because the column now exists.
- **Engine:** redeploy the previous Railway deployment. The new gateway treats
  the absence of `trajectory_hash_schema` as legacy.
- **Migration:** leave the columns in place, since they are nullable and
  ignored by older code. Drop them only after rolling the gateway back to a
  revision that does not write them.
- **Dependencies:** they roll back with the gateway deployment.

### C.3 Post-deploy checks
Use a dedicated canary org and environment, not customer data.

1. Engine `/health`: `engine_commit` starts `f25d300`, `secrets.degraded` is
   `false`, and `production` is `true`.
2. Send one shadow-mode `POST /api/v1/govern` with a destructive step. Expect:
   caller ALLOW, `would_be_verdict` BLOCK, `recorded: true`, and the row
   showing `shadow_observed_only = true`.
3. Send one enforce-mode decision. Expect the row recorded with
   `decision_binding_hash`, `trajectory_hash_schema = morrison.trajectory.v1`
   and a non-null `record_mac`. A null MAC means `RUNTIME_EVIDENCE_KEY` is not
   set on Vercel.
4. Run `verifyChain` for the canary environment. Expect `KEYED_VERIFIED`.
5. Replay the canary decision with `store_payloads` on. Expect
   `deterministic: true` and `hash_matches: true`.
6. `pendingMigrations()` should be empty. The engine response's
   `identity.source` should be `gateway_verified`; anything else means the
   Vercel gateway secret is missing or wrong.

### C.4 Finding D remediation (metadata only, for you to run)
- List variable **names** per environment, without values:

  ```bash
  vercel env ls production
  ```

  ```bash
  vercel env ls preview
  ```

  Confirm that production has `GOVERNANCE_GATEWAY_SECRET`,
  `RUNTIME_EVIDENCE_KEY`, `GOVERNANCE_TOKEN`, `GOVERNANCE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY`.
- Confirm that preview either has its own `GOVERNANCE_URL` pointing at a
  non-production engine, or has no engine token at all.
- If preview and production were ever given the same values, issue distinct
  preview credentials. That rotation is yours to approve. I have not done it.
- Do not use `railway variables` to check the engine, because it prints
  values. The engine's `/health` `secrets` block reports what is needed as
  booleans.

## D. Readiness assessment

| Claim | Verdict | Basis |
|---|---|---|
| In enforce mode, an unknown, malformed, contradictory or unavailable engine decision never authorises execution | **SUPPORTED (local)** / UNSUPPORTED (hosted, until deployed) | 201/201 checks, e2e |
| Shadow mode never executes and never reports a would-be ALLOW for a malformed decision | **SUPPORTED (local)** | same |
| `trajectory_hash` identifies the whole ordered trajectory; decisions are bound to principal, tenant and policy | **SUPPORTED (local, new records)**; legacy rows explicitly unbound | 14/14 tests, e2e exact replay |
| Decisions persist on the production schema in both modes | **SUPPORTED (production-equivalent)** / UNCERTAIN (hosted) | 26/26 on the schema built from production metadata |
| Supabase-backed evidence chains verify | **SUPPORTED (local)**. Hosted production would currently report INTEGRITY_FAILED for any chain. | C2 |
| Engine load-bearing secrets configured in production | **SUPPORTED** | production `/health` booleans |
| Vercel gateway secrets configured; preview isolated from production | **UNCERTAIN** | no Vercel metadata access |
| No critical npm advisories | **SUPPORTED** after upgrade (1 high remains: zod) | `npm audit` |
| Python service free of known advisories | **UNSUPPORTED** (14 starlette advisories; none reachable from app code) | `pip-audit` |
| Governed execution available in production | **UNSUPPORTED** (`rg_execution_records` absent; fails closed) | production table list |
| Numeric-parser hardening active in the enterprise engine | **UNSUPPORTED** (not integrated; `f25d300` still fails closed by `TypeError`) | probe |
| Any claim verified on hosted production | **UNSUPPORTED.** No hosted verification was performed. | section 0 |

## Appendix: regression, baseline (`ddd1f55`) vs repaired

| Suite | Baseline | Repaired |
|---|---|---|
| governance-service pytest | 70 passed | 84 passed (+14 binding) |
| `deploy-governance.yml` CI steps (14) | 14/14 | 14/14; script output identical apart from timestamps and paths |
| Engine `f25d300` suite | 1440 passed, 3 skipped | unchanged (engine not modified) |
| `scripts/runtime/*.test.cjs` (51 at baseline) | 49/51 files pass: `gateway` 44/1 and `hardening` 24/1 (both "exact replay", Finding B) | 54/54 files pass, run sequentially: the 51 plus `verdict-failclosed`, `persistence-schema` (skips without a DB; run separately below) and `chain-timestamptz` (`gateway` 45/0, `hardening` 25/0) |
| `verdict-failclosed` | 140/56 | 201/0 |
| `persistence-schema` (disposable PG) | 13/13 | 26/0 |
| `chain-timestamptz` | fails | 8/0 |
| `production-equivalent.e2e` (local engine and disposable PG with migrations) | 3/4 (nothing recorded, so everything fails closed) | 7/0; ALLOW recorded and executed once via the inert recorder, BLOCKs not executed |
| `tsc --noEmit` | n/a | 0 errors |
| `next build` | n/a | success |
| eslint (changed files) | n/a | clean |

**Environment:** Node 22.23, Python 3.13 (the service image uses 3.12),
Postgres 16.15 (production uses 17.6).

**Note on the baseline run:** a first baseline run of `hardening.test.cjs`
showed 2 extra failures. They came from running two copies in parallel on the
same fixed port (8795). Run sequentially, the baseline is 24/1.
