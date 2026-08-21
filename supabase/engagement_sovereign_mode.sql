-- ============================================================================
-- Engagement sovereign mode (additive / idempotent).
--
-- Sovereign is an engagement/deployment assurance mode layered around the same
-- Morrison Runtime Governance semantics. Standard engagements remain unchanged.
-- ============================================================================

alter table public.rg_engagements
  add column if not exists deployment_mode text not null default 'standard';

alter table public.rg_engagements
  add column if not exists sovereign_profile text not null default 'customer_cloud';

alter table public.rg_engagements
  add column if not exists sovereign_enabled_at timestamptz;

create index if not exists rg_engagements_deployment_mode_idx
  on public.rg_engagements(deployment_mode);

-- Guard the stored vocabulary without mutating historical rows. Existing rows
-- inherit the standard default; sovereign_profile is inert until mode=sovereign.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rg_engagements_deployment_mode_check'
  ) then
    alter table public.rg_engagements
      add constraint rg_engagements_deployment_mode_check
      check (deployment_mode in ('standard', 'sovereign')) not valid;
    alter table public.rg_engagements validate constraint rg_engagements_deployment_mode_check;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rg_engagements_sovereign_profile_check'
  ) then
    alter table public.rg_engagements
      add constraint rg_engagements_sovereign_profile_check
      check (sovereign_profile in ('customer_cloud', 'on_prem', 'sovereign_cloud', 'air_gapped')) not valid;
    alter table public.rg_engagements validate constraint rg_engagements_sovereign_profile_check;
  end if;
end $$;

notify pgrst, 'reload schema';
