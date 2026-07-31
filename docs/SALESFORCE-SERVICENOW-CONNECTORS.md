# Governed Salesforce and ServiceNow connectors

Salesforce CRM and ServiceNow ITSM use the same GuardianOS execution contract as
the governed Gmail connector:

`canonical action → proposal → Runtime Governance → block/escalate/permit → operator approval → re-evaluation → scope-bound permit → at-most-once provider call → immutable evidence`

Provider modules contain no governance authority. A connector must belong to the
same organisation and environment as the request, be enabled, have healthy live
OAuth validation, and permit the requested capability and object/table fields.

## Credentials and health

Both connectors use OAuth refresh credentials:

- `client_id`
- `client_secret`
- `refresh_token`

Credentials are staged briefly, encrypted with AES-256-GCM under
`INTEGRATION_SECRET_KEY`, and never returned in the connector projection,
proposal, logs, evidence, dashboard, or smoke report.

Salesforce validation refreshes OAuth and calls the lightweight
`/services/data/{version}/limits` endpoint. ServiceNow refreshes OAuth and reads
one bounded `sys_user` identity projection. Success persists `health=healthy`;
failure persists `down` or `degraded` plus the normalized provider reason.

Apply the additive production migration:

```bash
psql "$SUPABASE_DB_URL" -f supabase/enterprise_action_connector.sql
```

## Capability boundaries

Salesforce supports governed reads (`get_record`, `search_records`) and bounded
mutations for leads, cases, case comments, and tasks. The connector stores
explicit `allowed_objects`, `allowed_fields`, and `capabilities`. GuardianOS
constructs bounded SOQL internally; callers cannot submit arbitrary SOQL.

ServiceNow supports governed incident and change-request reads and mutations,
including work notes and assignment. The connector stores explicit
`allowed_tables`, `allowed_fields`, and `capabilities`. Arbitrary table access
and arbitrary encoded queries are not accepted.

Reads are medium-risk and execute only after a Runtime Governance permit.
Mutations reuse the existing `modify_customer` Ω vocabulary, whose
`ops_unauthorized_customer_modification` rule requires operator authorization.
Approval is re-evaluated by the engine and bound to the exact payload hash,
connector, organisation, environment, action, and run.

## Production smoke tests

The providers have separate manual workflows:

- `.github/workflows/salesforce-production-smoke.yml`
- `.github/workflows/servicenow-production-smoke.yml`

They are disabled by default and refuse to proceed unless every prerequisite is
present. Each invokes one explicitly selected mutation and fails if the initial
evaluation does not stop for approval, the provider invocation count is not
exactly one, no real external record ID is returned, immutable evidence is
missing, or the completed run is absent from the dashboard.

Configure provider-specific repository variables only after a dedicated test
tenant and cleanup plan exist:

- `{PROVIDER}_SMOKE_ENABLED=true`
- `{PROVIDER}_SMOKE_ENVIRONMENT_ID`
- `{PROVIDER}_SMOKE_CONNECTOR_ID`
- `{PROVIDER}_SMOKE_ACTION`
- secret `{PROVIDER}_SMOKE_INPUT` containing the exact JSON payload

Do not reuse production business records for the smoke. Enabling a workflow is
an explicit authorization to create or update exactly one test record.

## Sovereign behavior

The connector path crosses the shared outbound authorization boundary for OAuth
and provider API calls. Sovereign deployment mode and sovereign/air-gapped
profiles deny the request before network execution. Other restricted profiles
must allow the exact provider endpoint under the deployment outbound policy.
