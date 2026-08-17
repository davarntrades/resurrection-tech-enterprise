/* ============================================================================
 * Guardian OS — deployment profiles and activation state.
 *
 * Profiles define invariants, not labels. Shadow / Guarded Pilot / Enforced
 * remain lightweight. Production / Sovereign cannot become active without the
 * authoritative readiness engine passing.
 * ============================================================================ */
"use strict";
const store = require("./store");
const readiness = require("./production-readiness");

const PROFILE = Object.freeze({
  DEVELOPMENT: "DEVELOPMENT",
  SHADOW: "SHADOW",
  GUARDED_PILOT: "GUARDED_PILOT",
  ENFORCED: "ENFORCED",
  PRODUCTION: "PRODUCTION",
  SOVEREIGN: "SOVEREIGN",
});

const DEFINITIONS = Object.freeze({
  DEVELOPMENT: Object.freeze({ production: false, supervised: true, fail_closed: false, durable_evidence_required: false }),
  SHADOW: Object.freeze({ production: false, supervised: true, observation_only: true, fail_closed: false, durable_evidence_required: false }),
  GUARDED_PILOT: Object.freeze({ production: false, supervised: true, scoped_connectors: true, rollback_required: true, fail_closed: true }),
  ENFORCED: Object.freeze({ production: false, supervised: true, governed_execution: true, rollback_required: true, fail_closed: true }),
  PRODUCTION: Object.freeze({ production: true, supervised: false, tenant_rls: true, durable_evidence_required: true, chained_integrity: true, fail_closed: true, alerts_required: true, validated_preflight: true }),
  SOVEREIGN: Object.freeze({ production: true, sovereign: true, tenant_rls: true, durable_evidence_required: true, chained_integrity: true, fail_closed: true, alerts_required: true, validated_preflight: true, customer_trust_boundary: true, customer_secrets: true, customer_evidence: true, restricted_egress: true, vendor_control_plane_required: false }),
});

const SOVEREIGN_DEFAULTS = Object.freeze({
  data_plane: "customer_environment",
  control_plane: "customer_owned",
  secrets: "customer_owned",
  evidence_store: "customer_owned",
  outbound_telemetry: "disabled",
  external_dependencies: "deny_by_default",
  fail_closed: true,
  local_governance_engine: "required",
  evidence_durability: "required",
  tenant_isolation: "dedicated",
  provider_credentials: "customer_owned",
  admin_access: "explicit",
  network_egress: "restricted",
  audit_export: "customer_controlled",
});

function normalise(value) {
  const p = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!DEFINITIONS[p]) throw new Error(`unsupported deployment profile ${JSON.stringify(value)}`);
  return p;
}

function secureDefaults(profile) {
  const p = normalise(profile);
  return p === PROFILE.SOVEREIGN ? { ...SOVEREIGN_DEFAULTS } : { ...DEFINITIONS[p] };
}

async function current(environment_id) {
  if (!environment_id) return null;
  return store.findOneOptional("deployment_profiles", { environment_id });
}

async function evaluate({ org_id, environment_id, profile, config = {} }) {
  const p = normalise(profile);
  const env = await store.findOne("environments", { id: environment_id });
  if (!env || env.org_id !== org_id) throw new Error("environment not found");
  if (p === PROFILE.PRODUCTION) return readiness.productionReadiness();
  if (p === PROFILE.SOVEREIGN) {
    return readiness.sovereignReadiness({
      customer_secret_store: config.customer_secret_store || config.secret_store_ref,
      local_engine: config.local_engine === true || config.governance_engine_location === "local",
      sovereign_profile: config.sovereign_profile || "sovereign",
    });
  }
  return {
    status: readiness.POSTURE.READY,
    posture: readiness.POSTURE.READY,
    ready: true,
    profile: p,
    checked_at: new Date().toISOString(),
    checks: [{ id: "pilot_compatibility", name: "pilot compatibility", status: readiness.CHECK.PASS, required: true, detail: "existing supervised pilot pathway remains available" }],
  };
}

async function saveDraft({ org_id, environment_id, profile, config = {}, actor = "operator" }) {
  const p = normalise(profile);
  const env = await store.findOne("environments", { id: environment_id });
  if (!env || env.org_id !== org_id) throw new Error("environment not found");
  const merged = p === PROFILE.SOVEREIGN ? { ...SOVEREIGN_DEFAULTS, ...config } : { ...config };
  const existing = await current(environment_id);
  const patch = { org_id, environment_id, profile: p, config: merged, status: "inactive", activated_by: actor, updated_at: store.nowISO() };
  if (existing) await store.update("deployment_profiles", existing.id || environment_id, patch);
  else await store.insert("deployment_profiles", { id: environment_id, ...patch });
  return current(environment_id);
}

async function preflight(input) {
  const result = await evaluate(input);
  const existing = await current(input.environment_id);
  if (existing) await store.update("deployment_profiles", existing.id || input.environment_id, {
    last_preflight: result,
    last_verified_at: result.checked_at || store.nowISO(),
    status: result.ready ? "ready" : "blocked",
    updated_at: store.nowISO(),
  });
  return result;
}

async function activate({ org_id, environment_id, profile, config = {}, actor = "operator" }) {
  const p = normalise(profile);
  const saved = await saveDraft({ org_id, environment_id, profile: p, config, actor });
  const result = await preflight({ org_id, environment_id, profile: p, config: saved.config || config });
  if (!result.ready) {
    const error = new Error(`${p} activation refused: readiness posture ${result.status}`);
    error.code = "DEPLOYMENT_PREFLIGHT_FAILED";
    error.readiness = result;
    throw error;
  }
  await store.update("deployment_profiles", environment_id, {
    status: "active", activated_at: store.nowISO(), activated_by: actor,
    last_preflight: result, last_verified_at: result.checked_at || store.nowISO(), updated_at: store.nowISO(),
  });
  return { profile: await current(environment_id), readiness: result };
}

async function executionProfile({ org_id, environment_id }) {
  const row = await current(environment_id);
  if (!row || row.org_id !== org_id || row.status !== "active") return PROFILE.GUARDED_PILOT;
  return normalise(row.profile);
}

module.exports = {
  PROFILE, DEFINITIONS, SOVEREIGN_DEFAULTS,
  normalise, secureDefaults, current, evaluate, saveDraft, preflight, activate, executionProfile,
};
