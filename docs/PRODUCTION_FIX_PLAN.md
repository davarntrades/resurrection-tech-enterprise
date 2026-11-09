# Production fix plan (prepared 9 Nov 2026 — NOT executed)

Nothing in this document has been run against production. Each step needs the
owner's explicit approval.

## Current production state (observed, read-only)

- Railway project `runtime-governance-prod`, service `resurrection-tech-enterprise`
  (root `governance-service/`, branch `main`, commit `351ac31`).
- No `ENGINE_REF` variable is set, so the image uses the Dockerfile pin
  `331db20`, which predates `SecurityContext.trusted_facts`.
- Railway logs (8–9 Nov): every `POST /v1/govern` returned **500**
  (`TypeError: SecurityContext.__init__() got an unexpected keyword argument
  'trusted_facts'`); `GET /health` returned **500** at `app.py:576`.
  `/v1/evaluate` (advisory) and `/v1/assess` still answer 200.
- Effect: every governed request through the gateway becomes
  `ENGINE_UNAVAILABLE` → BLOCK; the Control Room's governed path is down.

## Option A — availability only (not recommended on its own)

Set Railway variable `ENGINE_REF=06b9b559509900f0950840b7a257c4a3c299ec56`
(engine `main`) on the production service and redeploy. No code change.

Verified locally (production service code `351ac31` + engine `06b9b55`):
`/health` → 200 and `/v1/govern` answers. **But** that service code reports the
LAST step's verdict: `[BLOCK, PERMIT]` returned **PERMIT** in the local test, and
the gateway acts on it. Engine `main` also still contains the reproduced Round 1
and Round 2 bypasses. Option A restores availability while re-exposing those
defects, so it is only acceptable as a short stop-gap with that risk accepted
in writing.

## Option B — the repaired system (recommended)

Verified on Railway staging (`runtime-governance-staging`, 9 Nov): service at
`615ee93` building engine `f25d300` (build gate passed), web at `dcb5b7c`.

1. Review and merge the engine branch `claude/elegant-planck-galciz`
   (Morrison-Runtime-Governance, head `f25d300`) to `main`.
2. Review and merge the enterprise branch `claude/elegant-planck-galciz`
   (head `dcb5b7c` or later) to `main`. Railway auto-deploys `main`.
3. Before step 2 deploys, on the production service:
   - attach a volume at `/data`;
   - set `GOVERNANCE_CONTINUITY_PATH=/data/continuity.jsonl`,
     `GOVERNANCE_REQUIRE_DURABLE_CONTINUITY=1`,
     `FRONTIER_SESSION_DB_PATH=/data/frontier_sessions.sqlite3`.
4. Apply `supabase/pilot_modes_evidence_v2.sql` (additive columns) to the
   production Supabase project.
5. On the web deployment (Vercel, not visible from the audit session): set
   `RUNTIME_EVIDENCE_KEY`; leave `RUNTIME_ENABLE_EXECUTION_ADAPTERS` unset unless
   execution targets are registered (`RUNTIME_EXECUTION_TARGETS`) and an
   adapter allowlist is set.
6. After deploy: `GET /health` must show `engine_commit` = the merged engine
   commit, `engine_compatibility.compatible: true`,
   `continuity.durable_across_restart: true`.
7. Run `scripts/runtime/staging-e2e.cjs` against a non-production copy first;
   it refuses production URLs by design.

Behaviour changes customers will see with Option B: `/execute` returns
`EXECUTION_DISABLED` until targets are registered; ENFORCE blocks when a
decision cannot be recorded; SHADOW returns ALLOW with `would_be_verdict`.

## Rollback

Railway keeps the previous deployment; "Rollback" in the Railway dashboard
restores `351ac31` + `331db20` (i.e. today's broken-but-known state). The
Supabase migration is additive and does not need reverting.
