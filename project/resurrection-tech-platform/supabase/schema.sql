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

-- Optional: updated_at trigger for status changes.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.created_at = new.created_at; -- no-op guard
  return new;
end; $$;
