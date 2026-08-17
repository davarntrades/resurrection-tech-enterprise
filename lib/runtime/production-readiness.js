/* ============================================================================
 * Guardian OS — authoritative production / sovereign readiness engine.
 *
 * One source of truth for CLI, API and Control Room. Unknown is never healthy.
 * This module observes controls; it does not change Morrison policy semantics.
 * ============================================================================ */
"use strict";
const store = require("./store");
const engine = require("./engine");
const tenantStore = require("./tenant-store");
const sovereignProfiles = require("../sovereign/profiles");
const sovereignDeployment = require("./sovereign/deployment");

const POSTURE = Object.freeze({ READY: "READY", DEGRADED: "DEGRADED", BLOCKED: "BLOCKED" });
const CHECK = Object.freeze({ PASS: "PASS", WARN: "WARN", FAIL: "FAIL", UNKNOWN: "UNKNOWN" });
const SOURCE_STATES = Object.freeze(["available", "unavailable", "missing_schema", "permission_denied", "read_error", "not_configured"]);

function check(id, status, detail, { required = true, meta = null } = {}) {
  return { id, name: id.replaceAll("_", " "), status, detail: detail || "", required, ...(meta ? { meta } : {}) };
}
function statusFromChecks(checks) {
  if (checks.some((c) => c.required && [CHECK.FAIL, CHECK.UNKNOWN].includes(c.status))) return POSTURE.BLOCKED;
  if (checks.some((c) => [CHECK.WARN, CHECK.UNKNOWN, CHECK.FAIL].includes(c.status))) return POSTURE.DEGRADED;
  return POSTURE.READY;
}
function normaliseSourceHealth(raw) {
  const out = {};
  for (const [name, value] of Object.entries(raw || {})) {
    const state = value && SOURCE_STATES.includes(value.state) ? value.state : "unavailable";
    out[name] = { ...(value || {}), state };
  }
  return out;
}

async function databaseControls() {
  const result = await store.rpcOptional("rg_production_controls", {});
  if (!result.ok) return { ok: false, reason: result.reason, detail: result.detail, controls: null };
  return { ok: true, controls: result.data || {} };
}

async function sourceHealth() {
  const result = await store.rpcOptional("rg_source_health", {});
  if (!result.ok) {
    const state = result.reason === "function_missing" ? "missing_schema"
      : result.reason === "no_cloud_backend" ? "not_configured" : "unavailable";
    return { ok: false, sources: { runtime_database: { state, detail: result.detail || result.reason } } };
  }
  return { ok: true, sources: normaliseSourceHealth(result.data) };
}

async function decisionChainHealth() {
  let envs;
  try { envs = await store.find("environments", {}); }
  catch (error) { return { ok: false, status: "UNKNOWN", detail: error.message }; }
  if (!envs.length) return { ok: true, status: "EMPTY", detail: "no environments have been provisioned" };
  for (const env of envs) {
    try {
      const result = await store.verifyChain(env.org_id, env.id);
      if (!result.ok) return { ok: false, status: "BROKEN", detail: `${env.id}: ${result.reason || "chain verification failed"}`, result };
    } catch (error) { return { ok: false, status: "UNKNOWN", detail: `${env.id}: ${error.message}` }; }
  }
  return { ok: true, status: "VERIFIED", detail: `${envs.length} environment decision chain(s) verified` };
}

async function connectorChainHealth() {
  let envs;
  try { envs = await store.find("environments", {}); }
  catch (error) { return { ok: false, status: "UNKNOWN", detail: error.message }; }
  if (!envs.length) return { ok: true, status: "EMPTY", detail: "no environments have been provisioned" };
  let legacy = 0;
  for (const env of envs) {
    for (const chain of ["integration_events", "ops_evidence"]) {
      const result = await store.rpcOptional("rg_verify_evidence_chain", { p_chain_name: chain, p_org: env.org_id, p_env: env.id });
      if (!result.ok) return { ok: false, status: "UNKNOWN", detail: `${chain}/${env.id}: ${result.detail || result.reason}` };
      const value = result.data || {};
      if (value.status === "BROKEN") return { ok: false, status: "BROKEN", detail: `${chain}/${env.id}: ${value.reason || "broken chain"}`, result: value };
      if (value.status === "LEGACY_PRE_CHAIN") legacy += Number(value.legacy_count || 0);
      if (value.status === "VERIFIED_WITH_LEGACY_PREFIX") legacy += Number(value.legacy_count || 0);
    }
  }
  return { ok: true, status: legacy ? "VERIFIED_WITH_LEGACY" : "VERIFIED", legacy_count: legacy,
    detail: legacy ? `new chained records verify; ${legacy} historical record(s) remain pre-chain/unverifiable` : "connector and operations evidence chains verified" };
}

async function tenantIsolationHealth() {
  if (!tenantStore.configured()) return { ok: false, status: "UNKNOWN", detail: "SUPABASE_ANON_KEY/SUPABASE_JWT_SECRET tenant path is not configured" };
  let orgs;
  try { orgs = await store.find("orgs", {}); }
  catch (error) { return { ok: false, status: "UNKNOWN", detail: error.message }; }
  if (orgs.length < 2) return { ok: false, status: "UNKNOWN", detail: "two organisations are required to prove cross-tenant isolation" };
  try {
    const proof = await tenantStore.proveTenantBoundary({ orgA: orgs[0].id, orgB: orgs[1].id });
    return { ok: proof.ok, status: proof.ok ? "VERIFIED" : "FAILED", detail: proof.ok ? proof.path : "cross-tenant read contract did not hold", proof };
  } catch (error) { return { ok: false, status: "UNKNOWN", detail: error.message }; }
}

function failClosedProductionActive(env = process.env) {
  // Production posture is fail-closed by architecture, not an opt-in toggle.
  // A compatibility variable can only make the posture stricter. Legacy false
  // values are ignored in production; development overrides are handled only
  // outside production profiles.
  return !/^(0|false|no|off)$/i.test(String(env.RUNTIME_PRODUCTION_FAIL_CLOSED || "true"));
}

function alertRouteHealth(env = process.env) {
  const configured = !!(env.RUNTIME_ALERT_WEBHOOK || env.RESEND_API_KEY || env.RUNTIME_ALERT_ROUTE);
  return { ok: configured, detail: configured ? "an operational alert route is configured" : "no RUNTIME_ALERT_WEBHOOK, RUNTIME_ALERT_ROUTE or RESEND_API_KEY detected" };
}

function rollbackHealth(env = process.env) {
  const configured = !!(env.RUNTIME_ROLLBACK_COMMAND || env.VERCEL_PROJECT_ID || env.RAILWAY_SERVICE_ID || env.GUARDIAN_ROLLBACK_PATH);
  return { ok: configured, detail: configured ? "rollback mechanism declared" : "rollback mechanism not declared" };
}

async function productionReadiness() {
  const checks = [];
  const [eng, db, sources, decisionChain, connectorChain, tenant] = await Promise.all([
    engine.health(), databaseControls(), sourceHealth(), decisionChainHealth(), connectorChainHealth(), tenantIsolationHealth(),
  ]);

  checks.push(check("engine_reachability", eng.ok ? CHECK.PASS : CHECK.FAIL,
    eng.ok ? `reachable at ${engine.ENGINE_URL}` : `unreachable: ${eng.error || eng.status || "unknown"}`));
  checks.push(check("durable_evidence", store.durable() ? CHECK.PASS : CHECK.FAIL,
    store.durable() ? `backend=${store.backend()}` : `backend=${store.backend()} is not accepted for general production`));
  checks.push(check("fail_closed_evidence", failClosedProductionActive() ? CHECK.PASS : CHECK.FAIL,
    failClosedProductionActive() ? "production evidence failure is required to block execution" : "production fail-closed posture is inactive"));

  if (!db.ok) {
    checks.push(check("migrations", CHECK.FAIL, `production controls unavailable: ${db.detail || db.reason}`));
    checks.push(check("rls", CHECK.UNKNOWN, "database controls could not be inspected"));
    checks.push(check("append_only", CHECK.UNKNOWN, "database controls could not be inspected"));
  } else {
    checks.push(check("migrations", db.controls.deployment_profiles && db.controls.connector_chain_schema ? CHECK.PASS : CHECK.FAIL,
      db.controls.deployment_profiles && db.controls.connector_chain_schema ? "general production readiness schema present" : "required production schema is incomplete"));
    checks.push(check("rls", db.controls.rls_enabled && db.controls.tenant_claim_function ? CHECK.PASS : CHECK.FAIL,
      db.controls.rls_enabled && db.controls.tenant_claim_function ? "tenant RLS controls and claim function present" : "tenant RLS controls are incomplete"));
    checks.push(check("append_only", db.controls.append_only_controls ? CHECK.PASS : CHECK.FAIL,
      db.controls.append_only_controls ? "append-only evidence controls detected" : "append-only evidence controls not detected"));
  }

  checks.push(check("tenant_isolation", tenant.ok ? CHECK.PASS : (tenant.status === "FAILED" ? CHECK.FAIL : CHECK.UNKNOWN), tenant.detail));
  checks.push(check("decision_chain", decisionChain.ok ? CHECK.PASS : (decisionChain.status === "BROKEN" ? CHECK.FAIL : CHECK.UNKNOWN), decisionChain.detail));
  checks.push(check("connector_chain", connectorChain.ok ? (connectorChain.legacy_count ? CHECK.WARN : CHECK.PASS) : (connectorChain.status === "BROKEN" ? CHECK.FAIL : CHECK.UNKNOWN), connectorChain.detail));

  const unavailable = Object.entries(sources.sources || {}).filter(([, v]) => v.state !== "available");
  checks.push(check("source_health", sources.ok && unavailable.length === 0 ? CHECK.PASS : (sources.ok ? CHECK.FAIL : CHECK.UNKNOWN),
    sources.ok ? (unavailable.length ? `unavailable evidence sources: ${unavailable.map(([k,v]) => `${k}:${v.state}`).join(", ")}` : "all required evidence sources available") : "source health could not be established",
    { meta: sources.sources }));

  const alerts = alertRouteHealth();
  checks.push(check("alert_routing", alerts.ok ? CHECK.PASS : CHECK.FAIL, alerts.detail));
  const rollback = rollbackHealth();
  checks.push(check("rollback_readiness", rollback.ok ? CHECK.PASS : CHECK.FAIL, rollback.detail));
  checks.push(check("rate_limit_posture", process.env.RUNTIME_RATE_LIMIT ? CHECK.PASS : CHECK.WARN,
    process.env.RUNTIME_RATE_LIMIT ? `RUNTIME_RATE_LIMIT=${process.env.RUNTIME_RATE_LIMIT}` : "rate-limit posture is not explicitly declared", { required: false }));

  const status = statusFromChecks(checks);
  return {
    status,
    posture: status,
    ready: status === POSTURE.READY,
    profile: "PRODUCTION",
    checked_at: new Date().toISOString(),
    summary: {
      pass: checks.filter((c) => c.status === CHECK.PASS).length,
      fail: checks.filter((c) => c.status === CHECK.FAIL).length,
      warn: checks.filter((c) => c.status === CHECK.WARN).length,
      unknown: checks.filter((c) => c.status === CHECK.UNKNOWN).length,
    },
    checks,
    source_health: sources.sources,
    integrity: { decision_chain: decisionChain, connector_chain: connectorChain },
    tenant_isolation: tenant,
  };
}

async function sovereignReadiness(options = {}) {
  const base = await productionReadiness();
  const checks = [...base.checks];
  let deployment;
  try { deployment = sovereignDeployment.validateStartup(options.env || process.env); }
  catch (error) {
    checks.push(check("sovereign_configuration", CHECK.FAIL, error.message));
    const status = statusFromChecks(checks);
    return { ...base, profile: "SOVEREIGN", status, posture: status, ready: false, checks };
  }

  let profile;
  try { profile = sovereignProfiles.profile(options.sovereign_profile || "sovereign"); }
  catch (error) {
    checks.push(check("sovereign_profile", CHECK.FAIL, error.message));
    const status = statusFromChecks(checks);
    return { ...base, profile: "SOVEREIGN", status, posture: status, ready: false, checks };
  }

  checks.push(check("external_control_plane", deployment.resurrection_control_plane_required === false ? CHECK.PASS : CHECK.FAIL,
    deployment.resurrection_control_plane_required === false ? "no mandatory Resurrection Tech control-plane dependency" : "vendor control plane dependency present"));
  checks.push(check("outbound_telemetry", !profile.telemetry && !deployment.telemetry_enabled ? CHECK.PASS : CHECK.FAIL,
    !profile.telemetry && !deployment.telemetry_enabled ? "outbound telemetry disabled" : "telemetry remains enabled"));
  checks.push(check("network_egress", profile.egress === "denied" ? CHECK.PASS : CHECK.FAIL,
    `profile egress=${profile.egress}`));
  checks.push(check("customer_controlled_evidence", profile.evidence === "local" ? CHECK.PASS : CHECK.FAIL,
    `evidence=${profile.evidence}`));
  checks.push(check("customer_controlled_secrets", options.customer_secret_store || process.env.GUARDIAN_CUSTOMER_SECRET_STORE ? CHECK.PASS : CHECK.UNKNOWN,
    options.customer_secret_store || process.env.GUARDIAN_CUSTOMER_SECRET_STORE ? "customer-controlled secret store declared" : "customer-controlled secret store not proven"));
  checks.push(check("local_governance_engine", options.local_engine || process.env.GUARDIAN_LOCAL_ENGINE === "1" ? CHECK.PASS : CHECK.UNKNOWN,
    options.local_engine || process.env.GUARDIAN_LOCAL_ENGINE === "1" ? "governance engine declared inside target boundary" : "local engine placement not proven"));
  checks.push(check("vendor_outage_survivability",
    (profile.policy_provider === "bundle" && profile.storage === "local" && profile.egress === "denied") ? CHECK.PASS : CHECK.FAIL,
    (profile.policy_provider === "bundle" && profile.storage === "local" && profile.egress === "denied")
      ? "policy + state remain local; vendor reachability is not required for enforcement" : "a mandatory remote dependency remains"));
  checks.push(check("signed_updates", profile.require_signed_bundles ? CHECK.PASS : CHECK.FAIL,
    profile.require_signed_bundles ? "signed bundle updates required" : "signed update requirement inactive"));
  checks.push(check("local_rollback", process.env.GUARDIAN_ROLLBACK_PATH || process.env.RUNTIME_ROLLBACK_COMMAND ? CHECK.PASS : CHECK.UNKNOWN,
    process.env.GUARDIAN_ROLLBACK_PATH || process.env.RUNTIME_ROLLBACK_COMMAND ? "local rollback path declared" : "local rollback path not proven"));

  const status = statusFromChecks(checks);
  return {
    ...base,
    profile: "SOVEREIGN",
    sovereign_profile: profile.id,
    status,
    posture: status,
    ready: status === POSTURE.READY,
    checks,
    sovereign: {
      data_residency: profile.storage === "local" ? "customer-owned" : "external dependency detected",
      secrets: options.customer_secret_store || process.env.GUARDIAN_CUSTOMER_SECRET_STORE ? "customer-controlled" : "unknown",
      governance_engine: options.local_engine || process.env.GUARDIAN_LOCAL_ENGINE === "1" ? "local" : "unknown",
      evidence: profile.evidence === "local" ? "local durable required" : profile.evidence,
      outbound_telemetry: !profile.telemetry ? "disabled" : "detected",
      external_control_plane_dependency: deployment.resurrection_control_plane_required ? "present" : "none",
      fail_closed: failClosedProductionActive() ? "active" : "inactive",
      network_egress: profile.egress,
    },
  };
}

async function assertProductionExecutionAllowed({ profile = "GUARDED_PILOT", sovereign = {} } = {}) {
  const p = String(profile || "GUARDED_PILOT").toUpperCase();
  if (!["PRODUCTION", "SOVEREIGN"].includes(p)) return { allowed: true, profile: p, reason: "pilot/enforced profile preserves existing pathway" };
  const result = p === "SOVEREIGN" ? await sovereignReadiness(sovereign) : await productionReadiness();
  if (result.status !== POSTURE.READY) {
    const err = new Error(`${p} execution blocked by readiness posture ${result.status}`);
    err.code = "PRODUCTION_POSTURE_BLOCKED";
    err.readiness = result;
    throw err;
  }
  return { allowed: true, profile: p, readiness: result };
}

module.exports = {
  POSTURE, CHECK, SOURCE_STATES,
  statusFromChecks, normaliseSourceHealth,
  databaseControls, sourceHealth, decisionChainHealth, connectorChainHealth, tenantIsolationHealth,
  productionReadiness, sovereignReadiness, assertProductionExecutionAllowed,
};
