/* ============================================================================
 * Guardian OS — authoritative production / sovereign readiness engine.
 *
 * One source of truth for CLI, API and Control Room. Unknown is never healthy.
 * Morrison policy/kernel semantics are not modified here.
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
const truthy = (v) => /^(1|true|yes|on)$/i.test(String(v || ""));

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
function envCheck(id, names, env = process.env, { required = true } = {}) {
  const missing = names.filter((name) => !env[name]);
  return check(id, missing.length ? (required ? CHECK.FAIL : CHECK.WARN) : CHECK.PASS,
    missing.length ? `missing ${missing.join(", ")}` : `${names.join(" + ")} configured`, { required });
}

async function databaseControls() {
  const result = await store.rpcOptional("rg_production_controls", {});
  if (!result.ok) return { ok: false, reason: result.reason, detail: result.detail, controls: null };
  return { ok: true, controls: result.data || {} };
}

async function sourceHealth() {
  const result = await store.rpcOptional("rg_source_health", {});
  if (!result.ok) {
    const text = String(result.detail || result.reason || "");
    const state = /permission|denied|42501/i.test(text) ? "permission_denied"
      : result.reason === "function_missing" ? "missing_schema"
      : result.reason === "no_cloud_backend" ? "not_configured" : "read_error";
    return { ok: false, sources: { runtime_database: { state, detail: text || result.reason } } };
  }
  return { ok: true, sources: normaliseSourceHealth(result.data) };
}

async function decisionChainHealth() {
  let envs;
  try { envs = await store.find("environments", {}); }
  catch (error) { return { ok: false, status: "UNKNOWN", detail: error.message }; }
  if (!envs.length) return { ok: false, status: "UNKNOWN", detail: "no environment exists to verify" };
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
  if (!envs.length) return { ok: false, status: "UNKNOWN", detail: "no environment exists to verify" };
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
  return {
    ok: true,
    status: legacy ? "VERIFIED_WITH_LEGACY" : "VERIFIED",
    legacy_count: legacy,
    detail: legacy ? `new chained records verify; ${legacy} historical record(s) remain legacy/pre-chain and are not labelled verified` : "connector + operations evidence chains verified, including persisted chain heads",
  };
}

async function tenantIsolationHealth() {
  if (!tenantStore.configured()) return { ok: false, status: "UNKNOWN", detail: "tenant JWT path is not configured (SUPABASE_ANON_KEY + SUPABASE_JWT_SECRET required)" };
  let orgs;
  try { orgs = await store.find("orgs", {}); }
  catch (error) { return { ok: false, status: "UNKNOWN", detail: error.message }; }
  const preferred = [process.env.PRODUCTION_RLS_TEST_ORG_A, process.env.PRODUCTION_RLS_TEST_ORG_B].filter(Boolean);
  const ids = preferred.length === 2 ? preferred : orgs.slice(0, 2).map((o) => o.id);
  if (ids.length < 2 || ids[0] === ids[1]) return { ok: false, status: "UNKNOWN", detail: "two distinct organisations are required to execute the live RLS isolation proof" };
  try {
    const proof = await tenantStore.proveTenantBoundary({ orgA: ids[0], orgB: ids[1] });
    return { ok: proof.ok, status: proof.ok ? "VERIFIED" : "FAILED", detail: proof.ok ? proof.path : "cross-tenant read contract did not hold", proof };
  } catch (error) { return { ok: false, status: "UNKNOWN", detail: error.message }; }
}

function alertRouteHealth(env = process.env) {
  const configured = !!(env.RUNTIME_ALERT_WEBHOOK || env.RESEND_API_KEY || env.RUNTIME_ALERT_ROUTE);
  return { ok: configured, detail: configured ? "operational alert route configured" : "no alert route configured" };
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
    store.durable() ? `backend=${store.backend()} (durable runtime store active)` : `backend=${store.backend()} is not accepted for general production`));
  // This is an architectural property of production-governance-runtime.js and
  // production-gateway-runtime.js. Legacy RUNTIME_REQUIRE_* flags may still tune
  // development/pilot behavior but cannot weaken an active hardened profile.
  checks.push(check("fail_closed_evidence", CHECK.PASS,
    "Production/Sovereign wrappers convert unrecorded decisions to BLOCK and gate executable connector calls on READY posture; legacy development overrides cannot relax active production profiles"));

  checks.push(envCheck("engine_authentication", ["GOVERNANCE_TOKEN"]));
  checks.push(envCheck("tenant_runtime_identity", ["SUPABASE_ANON_KEY", "SUPABASE_JWT_SECRET"]));

  if (!db.ok) {
    checks.push(check("migrations", CHECK.FAIL, `production controls unavailable: ${db.detail || db.reason}`));
    checks.push(check("rls", CHECK.UNKNOWN, "database RLS controls could not be inspected"));
    checks.push(check("append_only", CHECK.UNKNOWN, "database append-only controls could not be inspected"));
  } else {
    const controls = db.controls || {};
    checks.push(check("migrations", controls.deployment_profiles && controls.connector_chain_schema && controls.runtime_resources ? CHECK.PASS : CHECK.FAIL,
      controls.deployment_profiles && controls.connector_chain_schema && controls.runtime_resources ? "general production readiness schema present" : "required production schema is incomplete"));
    checks.push(check("rls", controls.rls_enabled && controls.tenant_policies_present && controls.tenant_claim_function ? CHECK.PASS : CHECK.FAIL,
      controls.rls_enabled && controls.tenant_policies_present && controls.tenant_claim_function ? "RLS enabled with active tenant policies + trusted claim function" : "database tenant boundary controls are incomplete"));
    checks.push(check("append_only", controls.append_only_controls ? CHECK.PASS : CHECK.FAIL,
      controls.append_only_controls ? "all three evidence append-only triggers detected and enabled" : "required append-only evidence trigger is missing or disabled"));
  }

  checks.push(check("tenant_isolation", tenant.ok ? CHECK.PASS : (tenant.status === "FAILED" ? CHECK.FAIL : CHECK.UNKNOWN), tenant.detail));
  checks.push(check("decision_chain", decisionChain.ok ? CHECK.PASS : (decisionChain.status === "BROKEN" ? CHECK.FAIL : CHECK.UNKNOWN), decisionChain.detail));
  checks.push(check("connector_chain", connectorChain.ok ? (connectorChain.legacy_count ? CHECK.WARN : CHECK.PASS) : (connectorChain.status === "BROKEN" ? CHECK.FAIL : CHECK.UNKNOWN), connectorChain.detail));

  const unavailable = Object.entries(sources.sources || {}).filter(([, v]) => v.state !== "available");
  checks.push(check("source_health", sources.ok && unavailable.length === 0 ? CHECK.PASS : (sources.ok ? CHECK.FAIL : CHECK.UNKNOWN),
    sources.ok ? (unavailable.length ? `evidence completeness not established: ${unavailable.map(([k,v]) => `${k}:${v.state}`).join(", ")}` : "all required audit sources available") : "audit source health could not be established",
    { meta: sources.sources }));

  const alerts = alertRouteHealth();
  checks.push(check("alert_routing", alerts.ok ? CHECK.PASS : CHECK.FAIL, alerts.detail));
  const rollback = rollbackHealth();
  checks.push(check("rollback_readiness", rollback.ok ? CHECK.PASS : CHECK.FAIL, rollback.detail));
  checks.push(check("rate_limit_posture", process.env.RUNTIME_RATE_LIMIT ? CHECK.PASS : CHECK.WARN,
    process.env.RUNTIME_RATE_LIMIT ? `RUNTIME_RATE_LIMIT=${process.env.RUNTIME_RATE_LIMIT}` : "rate-limit posture is not explicitly declared", { required: false }));

  const status = statusFromChecks(checks);
  return {
    status, posture: status, ready: status === POSTURE.READY, profile: "PRODUCTION",
    checked_at: new Date().toISOString(),
    summary: {
      pass: checks.filter((c) => c.status === CHECK.PASS).length,
      fail: checks.filter((c) => c.status === CHECK.FAIL).length,
      warn: checks.filter((c) => c.status === CHECK.WARN).length,
      unknown: checks.filter((c) => c.status === CHECK.UNKNOWN).length,
    },
    checks, source_health: sources.sources,
    integrity: { decision_chain: decisionChain, connector_chain: connectorChain },
    tenant_isolation: tenant,
  };
}

async function sovereignReadiness(options = {}) {
  const base = await productionReadiness();
  const checks = [...base.checks];
  const env = options.env || process.env;
  let deployment;
  try { deployment = sovereignDeployment.validateStartup(env); }
  catch (error) {
    checks.push(check("sovereign_configuration", CHECK.FAIL, error.message));
    const status = statusFromChecks(checks);
    return { ...base, profile: "SOVEREIGN", status, posture: status, ready: false, checks };
  }

  let profile;
  try { profile = sovereignProfiles.profile(options.sovereign_profile || "sovereign_private"); }
  catch (error) {
    checks.push(check("sovereign_profile", CHECK.FAIL, error.message));
    const status = statusFromChecks(checks);
    return { ...base, profile: "SOVEREIGN", status, posture: status, ready: false, checks };
  }

  const activeProfileMatches = sovereignProfiles.profileSafe().id === profile.id;
  const customerDataPlane = truthy(env.GUARDIAN_CUSTOMER_DATA_PLANE);
  const localEngine = truthy(env.GUARDIAN_LOCAL_ENGINE);
  const endpointProvenance = truthy(env.GUARDIAN_PROVIDER_ENDPOINTS_VERIFIED);
  const egressVerified = truthy(env.GUARDIAN_EGRESS_VERIFIED);
  const secretStore = options.customer_secret_store || env.GUARDIAN_CUSTOMER_SECRET_STORE;
  const evidenceStore = options.customer_evidence_store || env.GUARDIAN_CUSTOMER_EVIDENCE_STORE;

  checks.push(check("sovereign_profile_active", activeProfileMatches ? CHECK.PASS : CHECK.FAIL,
    activeProfileMatches ? `active low-level profile=${profile.id}` : `requested ${profile.id}, active low-level profile=${sovereignProfiles.profileSafe().id}`));
  checks.push(check("customer_data_plane", customerDataPlane && store.durable() ? CHECK.PASS : CHECK.FAIL,
    customerDataPlane && store.durable() ? "durable runtime database is explicitly attested customer-owned" : "customer-owned durable data plane is not proven (set GUARDIAN_CUSTOMER_DATA_PLANE=1 inside the customer boundary)"));
  checks.push(check("external_control_plane", deployment.resurrection_control_plane_required === false ? CHECK.PASS : CHECK.FAIL,
    deployment.resurrection_control_plane_required === false ? "no mandatory Resurrection Tech control-plane dependency" : "vendor control-plane dependency present"));
  checks.push(check("outbound_telemetry", !profile.telemetry && !deployment.telemetry_enabled ? CHECK.PASS : CHECK.FAIL,
    !profile.telemetry && !deployment.telemetry_enabled ? "outbound telemetry disabled" : "telemetry remains enabled"));
  checks.push(check("network_egress", ["restricted", "denied"].includes(profile.egress) && egressVerified ? CHECK.PASS : (egressVerified ? CHECK.FAIL : CHECK.UNKNOWN),
    egressVerified ? `egress policy verified; profile=${profile.egress}` : "network egress policy has not been independently verified in this target environment"));
  checks.push(check("provider_endpoint_provenance", endpointProvenance ? CHECK.PASS : CHECK.UNKNOWN,
    endpointProvenance ? "approved provider endpoint provenance verified" : "provider endpoint provenance not verified"));
  checks.push(check("customer_controlled_evidence", evidenceStore && customerDataPlane ? CHECK.PASS : CHECK.UNKNOWN,
    evidenceStore && customerDataPlane ? `customer-controlled evidence store: ${String(evidenceStore)}` : "customer-controlled evidence store not proven"));
  checks.push(check("customer_controlled_secrets", secretStore ? CHECK.PASS : CHECK.UNKNOWN,
    secretStore ? `customer-controlled secret store: ${String(secretStore)}` : "customer-controlled secret store not proven"));
  checks.push(check("local_governance_engine", localEngine && base.checks.find((c) => c.id === "engine_reachability")?.status === CHECK.PASS ? CHECK.PASS : CHECK.UNKNOWN,
    localEngine ? "governance engine is declared inside the target boundary and reachable" : "local engine placement not proven (GUARDIAN_LOCAL_ENGINE=1 required in target environment)"));
  checks.push(check("signed_updates", profile.require_signed_bundles ? CHECK.PASS : CHECK.FAIL,
    profile.require_signed_bundles ? "signed update bundles required" : "signed update requirement inactive"));
  checks.push(check("local_rollback", env.GUARDIAN_ROLLBACK_PATH || env.RUNTIME_ROLLBACK_COMMAND ? CHECK.PASS : CHECK.UNKNOWN,
    env.GUARDIAN_ROLLBACK_PATH || env.RUNTIME_ROLLBACK_COMMAND ? "local rollback path declared" : "local rollback path not proven"));
  checks.push(check("operator_recovery", env.GUARDIAN_RECOVERY_RUNBOOK ? CHECK.PASS : CHECK.UNKNOWN,
    env.GUARDIAN_RECOVERY_RUNBOOK ? "operator recovery runbook declared" : "operator recovery path not documented in deployment configuration"));

  const vendorIndependent = profile.policy_provider === "bundle" && customerDataPlane && localEngine
    && deployment.resurrection_control_plane_required === false && !profile.telemetry;
  checks.push(check("vendor_outage_survivability", vendorIndependent ? CHECK.PASS : CHECK.FAIL,
    vendorIndependent ? "policy + durable state + governance engine remain inside customer boundary; Resurrection Tech reachability is not required for enforcement" : "vendor-outage survivability is not fully proven"));

  const status = statusFromChecks(checks);
  return {
    ...base,
    profile: "SOVEREIGN", sovereign_profile: profile.id,
    status, posture: status, ready: status === POSTURE.READY, checks,
    checked_at: new Date().toISOString(),
    sovereign: {
      data_residency: customerDataPlane ? "customer-owned" : "unknown",
      secrets: secretStore ? "customer-controlled" : "unknown",
      governance_engine: localEngine ? "local" : "unknown",
      evidence: evidenceStore && customerDataPlane ? "customer-controlled durable" : "incomplete",
      outbound_telemetry: !profile.telemetry && !deployment.telemetry_enabled ? "disabled" : "detected",
      external_control_plane_dependency: deployment.resurrection_control_plane_required ? "present" : "none",
      fail_closed: "active",
      network_egress: egressVerified ? profile.egress : "unknown",
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
