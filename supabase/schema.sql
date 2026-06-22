-- ============================================================
-- Resurrection Tech™ — Supabase schema
-- Run in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists public.audit_requests (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  created_at timestamptz not null default now(),

  -- Organisation
  company_name text not null,
  industry text default '',
  website text default '',
  team_size text default '',
  contact_name text not null,
  contact_email text not null,
  contact_phone text default '',

  -- System overview
  agent_platform text default '',
  models_used text default '',
  ai_system_type text[] default '{}',
  deployment_type text default '',
  autonomy_level text default '',

  -- Risk profile
  risk_capabilities text[] default '{}',
  risk_summary text default '',

  -- Scope / recommendation
  audit_scope text default '',
  estimated_investment text default '',

  -- Ops metadata
  status text not null default 'new',  -- new | reviewing | scheduled | declined
  source_ip text default '',
  user_agent text default ''
);

create index if not exists audit_requests_created_at_idx
  on public.audit_requests (created_at desc);
create index if not exists audit_requests_status_idx
  on public.audit_requests (status);

-- ── Row Level Security ──────────────────────────────────────
-- The API route writes with the service-role key, which bypasses RLS.
-- We enable RLS and add NO public policies, so the anon key cannot
-- read or write this table from the browser.
alter table public.audit_requests enable row level security;

-- (Intentionally no anon policies. Manage rows via the service role
--  or the Supabase dashboard / an authenticated internal app.)

-- ============================================================
-- Enterprise leads (booking / contact form). Optional sink — the
-- /api/lead route also supports Formspree forwarding and Resend.
-- ============================================================
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  created_at timestamptz not null default now(),

  name text not null,
  organisation text default '',
  email text not null,
  role text default '',
  use_case text default '',
  message text default '',
  source text default '',

  status text not null default 'new',  -- new | contacted | scheduled | closed
  source_ip text default '',
  user_agent text default ''
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_status_idx on public.leads (status);

-- Same posture as audit_requests: RLS on, no anon policies. The service
-- role (API route) bypasses RLS; the browser anon key cannot read/write.
alter table public.leads enable row level security;

-- Optional: updated_at trigger for status changes.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.created_at = new.created_at; -- no-op guard
  return new;
end; $$;

-- ============================================================
-- Runtime Governance Assessments (questionnaire intake).
-- Every completed /assessment submission is stored here so referral
-- attribution, conversion tracking, and partner reporting work
-- automatically. Written by the API route via the service role.
-- ============================================================
create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  submitted_at timestamptz not null default now(),

  -- Contact / company
  company text not null,
  contact_name text not null,
  contact_email text not null,
  job_title text default '',
  company_size text default '',
  phone text default '',
  industry text default '',
  country text default '',

  -- Recommendation + internal scores
  recommended_pathway text default '',     -- workshop | audit | pilot | integration
  maturity_score int,
  complexity_score int,
  omega_exposure_score int,

  -- Referral attribution
  referral_source text default 'Direct / Unknown',
  referral_code text default '',
  referral_link text default '',

  -- Pipeline
  status text not null default 'New Lead',  -- New Lead | Workshop | Audit | Pilot | Integration | Won | Lost

  -- Full payload + ops metadata
  payload jsonb,
  source_ip text default '',
  user_agent text default ''
);

create index if not exists assessments_submitted_at_idx on public.assessments (submitted_at desc);
create index if not exists assessments_status_idx on public.assessments (status);
create index if not exists assessments_referral_code_idx on public.assessments (referral_code);

-- RLS on, no anon policies (same posture as audit_requests / leads). The API
-- route writes with the service role, which bypasses RLS; the browser anon key
-- cannot read or write this table.
alter table public.assessments enable row level security;

-- ── Partner analytics foundation ────────────────────────────
-- Per-referral-source rollup that can power a future partner dashboard.
-- "leads" counts every assessment; the stage columns count pipeline status,
-- and rec_* count the recommended pathway at submission time.
create or replace view public.referral_summary as
select
  coalesce(nullif(referral_code, ''), 'direct')              as referral_code,
  coalesce(nullif(referral_source, ''), 'Direct / Unknown')  as referral_source,
  count(*)                                                   as leads,
  count(*) filter (where status = 'Workshop')                as workshops,
  count(*) filter (where status = 'Audit')                   as audits,
  count(*) filter (where status = 'Pilot')                   as pilots,
  count(*) filter (where status = 'Integration')             as integrations,
  count(*) filter (where status = 'Won')                     as won,
  count(*) filter (where status = 'Lost')                    as lost,
  count(*) filter (where recommended_pathway = 'workshop')   as rec_workshop,
  count(*) filter (where recommended_pathway = 'audit')      as rec_audit,
  count(*) filter (where recommended_pathway = 'pilot')      as rec_pilot,
  count(*) filter (where recommended_pathway = 'integration') as rec_integration,
  max(submitted_at)                                          as last_lead_at
from public.assessments
group by 1, 2
order by leads desc;

-- ============================================================
-- Referrers (referral-link registry). Future-proofing for partner
-- onboarding / notifications: when someone generates a referral link at
-- /referral, the code (and an OPTIONAL referrer email) is captured here so we
-- can later connect partner visibility, onboarding, and communication without
-- rebuilding the flow. No commission/payment data lives here. Written by the
-- API route via the service role; one row per referral code (upsert).
-- ============================================================
create table if not exists public.referrers (
  referral_code text primary key,
  referral_source text default '',
  referrer_email text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS on, no anon policies (same posture as assessments). The browser anon key
-- cannot read or write this table; only the service role (API route) can.
alter table public.referrers enable row level security;
