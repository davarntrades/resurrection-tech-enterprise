#!/usr/bin/env node
"use strict";

const MARKER = "LEVEL2_DISPOSABLE_VALIDATION";
const PREFIX = "VALIDATION_DO_NOT_USE_IN_PROD";

const FIXTURES = Object.freeze({
  marker: MARKER,
  orgA: Object.freeze({
    id: "validation_org_a_do_not_use_in_prod",
    name: "VALIDATION_ORG_A_DO_NOT_USE_IN_PROD",
    slug: "validation-org-a-do-not-use-in-prod",
  }),
  orgB: Object.freeze({
    id: "validation_org_b_do_not_use_in_prod",
    name: "VALIDATION_ORG_B_DO_NOT_USE_IN_PROD",
    slug: "validation-org-b-do-not-use-in-prod",
  }),
  envA: Object.freeze({
    id: "validation_env_a_do_not_use_in_prod",
    org_id: "validation_org_a_do_not_use_in_prod",
    name: "VALIDATION_ENV_A_DO_NOT_USE_IN_PROD",
  }),
  envB: Object.freeze({
    id: "validation_env_b_do_not_use_in_prod",
    org_id: "validation_org_b_do_not_use_in_prod",
    name: "VALIDATION_ENV_B_DO_NOT_USE_IN_PROD",
  }),
  legacyEnv: Object.freeze({
    id: "validation_env_legacy_do_not_use_in_prod",
    org_id: "validation_org_a_do_not_use_in_prod",
    name: "VALIDATION_ENV_LEGACY_DO_NOT_USE_IN_PROD",
  }),
  connector: Object.freeze({
    id: "validation_connector_do_not_use_in_prod",
    org_id: "validation_org_a_do_not_use_in_prod",
    environment_id: "validation_env_a_do_not_use_in_prod",
    type: "validation",
    name: "VALIDATION_CONNECTOR_DO_NOT_USE_IN_PROD",
  }),
  integrationEvents: Object.freeze([
    "validation_event_001_do_not_use_in_prod",
    "validation_event_002_do_not_use_in_prod",
    "validation_event_003_do_not_use_in_prod",
  ]),
  legacyEvent: "validation_event_legacy_do_not_use_in_prod",
  decision: "validation_decision_do_not_use_in_prod",
  report: "validation_report_do_not_use_in_prod",
  deploymentProfile: "validation_deployment_profile_do_not_use_in_prod",
  resources: Object.freeze({
    canary: "validation_resource_canary_do_not_use_in_prod",
    staging: "validation_resource_staging_do_not_use_in_prod",
    production: "validation_resource_production_do_not_use_in_prod",
    sovereign: "validation_resource_sovereign_do_not_use_in_prod",
  }),
  sourceHealthStates: Object.freeze([
    "available",
    "unavailable",
    "missing_schema",
    "permission_denied",
    "read_error",
    "not_configured",
  ]),
});

function assertFixture(value) {
  const text = String(value || "").toLowerCase();
  if (!text.includes("validation") || !text.includes("do_not_use_in_prod")) {
    throw new Error(`unsafe fixture identifier: ${value}`);
  }
  return value;
}

function allFixtureIds() {
  return [
    FIXTURES.orgA.id,
    FIXTURES.orgB.id,
    FIXTURES.envA.id,
    FIXTURES.envB.id,
    FIXTURES.legacyEnv.id,
    FIXTURES.connector.id,
    ...FIXTURES.integrationEvents,
    FIXTURES.legacyEvent,
    FIXTURES.decision,
    FIXTURES.report,
    FIXTURES.deploymentProfile,
    ...Object.values(FIXTURES.resources),
  ].map(assertFixture);
}

if (require.main === module) {
  console.log(JSON.stringify({ prefix: PREFIX, ...FIXTURES, ids: allFixtureIds() }, null, 2));
}

module.exports = { MARKER, PREFIX, FIXTURES, assertFixture, allFixtureIds };
