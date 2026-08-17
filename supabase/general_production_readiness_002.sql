-- Follow-up for General Production Readiness.
-- Runtime store collections use an `id` key. Deployment profiles are one row per
-- environment, so id is deterministically the environment_id (not a second
-- identity source).

alter table public.rg_deployment_profiles add column if not exists id text;
update public.rg_deployment_profiles set id = environment_id where id is null;
alter table public.rg_deployment_profiles alter column id set not null;
create unique index if not exists rg_deployment_profiles_id_uidx on public.rg_deployment_profiles(id);

create or replace function public.rg_deployment_profile_id()
returns trigger language plpgsql as $$
begin
  new.id := new.environment_id;
  return new;
end $$;

drop trigger if exists rg_deployment_profile_id_before_write on public.rg_deployment_profiles;
create trigger rg_deployment_profile_id_before_write
before insert or update on public.rg_deployment_profiles
for each row execute function public.rg_deployment_profile_id();
