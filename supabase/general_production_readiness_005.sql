-- General Production Readiness — least-privilege tenant grants.
-- RLS is the row boundary; SQL privileges are the operation boundary.
-- Ordinary tenant runtime identities are intentionally read-only on audit/control
-- surfaces. API keys and connector secret material remain privileged backend-only.

do $$
declare
  t text;
  all_tenant_tables text[] := array[
    'rg_orgs','rg_environments','rg_api_keys','rg_manifest_versions','rg_manifests',
    'rg_decisions','rg_reports','rg_chain_heads','rg_alerts',
    'rg_integration_connectors','rg_integration_webhooks','rg_integration_webhook_deliveries',
    'rg_integration_deployments','rg_integration_usage','rg_integration_events','rg_integration_secrets',
    'rg_ops_proposals','rg_ops_evidence','rg_ops_events','rg_ops_transitions','rg_ops_handoffs',
    'rg_ops_email_events','rg_ops_incidents','rg_ops_intel_snapshots','rg_deployment_profiles','rg_runtime_resources'
  ];
  readable_tables text[] := array[
    'rg_orgs','rg_environments','rg_manifest_versions','rg_manifests','rg_decisions','rg_reports',
    'rg_alerts','rg_integration_connectors','rg_integration_events','rg_ops_proposals','rg_ops_evidence',
    'rg_deployment_profiles','rg_runtime_resources'
  ];
begin
  foreach t in array all_tenant_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all privileges on table public.%I from authenticated', t);
    end if;
  end loop;
  foreach t in array readable_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('grant select on table public.%I to authenticated', t);
    end if;
  end loop;
end $$;

-- Sensitive material remains explicitly unavailable to ordinary tenant JWTs.
revoke all privileges on table public.rg_api_keys from authenticated;
revoke all privileges on table public.rg_integration_secrets from authenticated;

-- Chain head metadata is exposed only via verifier RPC, not direct table access.
revoke all privileges on table public.rg_evidence_chain_heads from authenticated;
