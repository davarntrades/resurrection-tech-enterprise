-- Minimal payment-status ledger for /pay.
-- Stores ONLY non-sensitive status. No card numbers, no bank details, no
-- payment credentials are ever written here.
--
-- Apply in the Supabase SQL editor (service role inserts via the webhooks).

create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null check (provider in ('stripe','gocardless')),
  provider_id   text not null unique,        -- session / billing-request / payment id
  status        text not null,               -- e.g. 'paid', 'confirmed', 'active'
  amount_minor  bigint,                       -- pence; null for mandate-only flows
  currency      text not null default 'gbp',
  service_type  text not null default 'unknown',
  created_at    timestamptz not null default now()
);

-- Service-role only; the public anon key has no access.
alter table public.payments enable row level security;

create index if not exists payments_created_at_idx on public.payments (created_at desc);
create index if not exists payments_service_idx on public.payments (service_type);
