-- Runtime Governance — finite-model verification artifacts.
--
-- Holds artifacts produced by the Python verifier (schema
-- mrg.global-verification.v2) so the Control Room can show what was verified,
-- under which ruleset, by which commit — and whether the configuration running
-- now still matches it.
--
-- This table is EVIDENCE, not configuration. The application never writes a
-- verification result of its own: rows arrive from CI, out of band. The
-- verification surface (lib/runtime/verification.js) reads only.
--
-- Safe to apply after the fact. Until it exists, findOptional() degrades and
-- the Control Room reports the verification class as UNKNOWN — which is the
-- correct reading of "no artifact has been ingested", and is never rendered as
-- reassurance.
create table if not exists public.rg_verification_artifacts (
  id                   text primary key,
  org_id               text not null,
  environment_id       text not null,

  -- Identity of the verification RUN (binds model, ruleset, algorithm and the
  -- escalation resolutions actually enumerated).
  verification_id      text not null,
  -- Identity of the declared finite MODEL, and of the transition relation the
  -- control enumeration exercised.
  model_hash           text,
  transition_relation_id text,
  -- Identity of the governance that decided every modelled transition.
  ruleset_hash         text,
  engine_version       text,
  -- Identity of the code that ran the enumeration.
  repository_commit    text,
  verifier_version     text,

  verdict              text,        -- SAFE_WITHIN_MODEL | UNSAFE_COUNTEREXAMPLE_FOUND | INCONCLUSIVE
  complete_enumeration boolean,
  escalations_admitted jsonb,       -- ["deny"] | ["deny","approve"]

  -- What the pilot environment was declared to offer, so drift is detectable.
  verified_tools       jsonb,
  verified_permissions jsonb,

  -- The artifact itself, stored as the exact bytes that were ingested, plus a
  -- SHA-256 over those bytes. Node cannot reproduce the artifact's INTERNAL
  -- canonical-JSON digest (Python emits 120.0 where JSON.stringify emits 120),
  -- so this hash is what this deployment can independently re-check.
  content_sha256       text not null,
  artifact             text not null,
  -- The producing system's own validation result, carried as a REPORTED claim.
  producer_validation  jsonb,

  ingested_at          timestamptz not null default now()
);

create index if not exists rg_verif_env_idx
  on public.rg_verification_artifacts(environment_id, ingested_at desc);
create index if not exists rg_verif_org_idx
  on public.rg_verification_artifacts(org_id, ingested_at desc);
create unique index if not exists rg_verif_unique_idx
  on public.rg_verification_artifacts(environment_id, verification_id, content_sha256);

-- Same posture as every other rg_* table: RLS on, and no permissive policies,
-- so only the service role can read or write. The browser never touches this
-- table directly — reads go through the authenticated admin API, which is
-- read-only by design (see app/api/runtime/admin/verification/route.ts).
alter table public.rg_verification_artifacts enable row level security;
