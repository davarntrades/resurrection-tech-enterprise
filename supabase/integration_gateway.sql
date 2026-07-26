-- GuardianOS Integration Gateway — additive enterprise onboarding schema.
-- Apply after governance_runtime.sql and operations_agent.sql. Idempotent.

alter table public.rg_api_keys add column if not exists scopes jsonb;
alter table public.rg_api_keys add column if not exists environment_restrictions jsonb;
alter table public.rg_api_keys add column if not exists expires_at timestamptz;
alter table public.rg_api_keys add column if not exists revoked_at timestamptz;
alter table public.rg_api_keys add column if not exists rotated_to text;
create index if not exists rg_keys_expiry_idx on public.rg_api_keys(org_id, expires_at);

create table if not exists public.rg_integration_connectors (
  id text primary key,
  org_id text not null references public.rg_orgs(id) on delete cascade,
  environment_id text not null references public.rg_environments(id) on delete cascade,
  type text not null, name text not null, endpoint text,
  config jsonb default '{}'::jsonb, secret_encrypted text,
  status text default 'configured', health text default 'unknown',
  latency_ms double precision, last_checked_at timestamptz, last_error text,
  created_by text, created_at timestamptz default now()
);
create index if not exists rg_int_connectors_org_idx on public.rg_integration_connectors(org_id, environment_id);

create table if not exists public.rg_integration_webhooks (
  id text primary key,
  org_id text not null references public.rg_orgs(id) on delete cascade,
  environment_id text not null references public.rg_environments(id) on delete cascade,
  name text not null, url text not null, events jsonb default '[]'::jsonb,
  secret_encrypted text not null, secret_prefix text,
  status text default 'active', capture_payloads boolean default false,
  failure_count integer default 0, last_delivery_at timestamptz,
  last_success_at timestamptz, created_at timestamptz default now()
);
create index if not exists rg_int_webhooks_org_idx on public.rg_integration_webhooks(org_id, environment_id);

create table if not exists public.rg_integration_webhook_deliveries (
  id text primary key,
  org_id text not null references public.rg_orgs(id) on delete cascade,
  environment_id text references public.rg_environments(id) on delete cascade,
  webhook_id text not null references public.rg_integration_webhooks(id) on delete cascade,
  event_type text not null, event_id text, payload_hash text not null, payload jsonb,
  payload_encrypted text,
  attempt integer default 1, status text not null, response_status integer,
  latency_ms double precision, error text, delivered_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists rg_int_delivery_org_idx on public.rg_integration_webhook_deliveries(org_id, created_at desc);
create index if not exists rg_int_delivery_hook_idx on public.rg_integration_webhook_deliveries(webhook_id, created_at desc);
alter table public.rg_integration_webhook_deliveries add column if not exists payload_encrypted text;

create table if not exists public.rg_integration_deployments (
  id text primary key,
  org_id text not null references public.rg_orgs(id) on delete cascade,
  environment_id text not null references public.rg_environments(id) on delete cascade,
  name text not null, target text not null, model text default 'platform',
  status text default 'ready', version text, requested_by text,
  health text default 'unknown', deployed_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists rg_int_deployments_org_idx on public.rg_integration_deployments(org_id, environment_id);

create table if not exists public.rg_integration_usage (
  id text primary key,
  org_id text not null references public.rg_orgs(id) on delete cascade,
  environment_id text references public.rg_environments(id) on delete cascade,
  key_id text, operation text not null, sdk text, status text default 'ok',
  latency_ms double precision, meta jsonb, created_at timestamptz default now()
);
create index if not exists rg_int_usage_org_time_idx on public.rg_integration_usage(org_id, created_at desc);

create table if not exists public.rg_integration_events (
  id text primary key,
  org_id text not null references public.rg_orgs(id) on delete cascade,
  environment_id text not null references public.rg_environments(id) on delete cascade,
  type text not null, actor text, evidence jsonb not null, evidence_hash text not null,
  immutable boolean default true, occurred_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists rg_int_events_org_time_idx on public.rg_integration_events(org_id, created_at desc);
create index if not exists rg_int_events_hash_idx on public.rg_integration_events(evidence_hash);

-- Short-lived encrypted hand-off records keep plaintext secrets out of
-- proposal params, execution results, logs and evidence.
create table if not exists public.rg_integration_secrets (
  id text primary key,
  org_id text not null references public.rg_orgs(id) on delete cascade,
  purpose text, value_encrypted text not null, expires_at timestamptz not null,
  created_at timestamptz default now()
);
create index if not exists rg_int_secrets_expiry_idx on public.rg_integration_secrets(expires_at);

alter table public.rg_integration_connectors enable row level security;
alter table public.rg_integration_webhooks enable row level security;
alter table public.rg_integration_webhook_deliveries enable row level security;
alter table public.rg_integration_deployments enable row level security;
alter table public.rg_integration_usage enable row level security;
alter table public.rg_integration_events enable row level security;
alter table public.rg_integration_secrets enable row level security;
-- No permissive policies: service-role only; API routes enforce org isolation.
