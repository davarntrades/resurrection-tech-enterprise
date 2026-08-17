/* ============================================================================
 * Production posture wrapper for the existing runtime governance gateway.
 *
 * Morrison/kernel semantics are untouched. Once an environment has ACTIVATED
 * PRODUCTION or SOVEREIGN, every request proves its tenant/environment through
 * the RLS-constrained authenticated database path and can never return an
 * executable ALLOW when durable decision evidence was unavailable.
 * ============================================================================ */
"use strict";

function wrapGovernanceGateway(base, store) {
  if (!base || !store) throw new Error("base gateway + store are required");
  const tenantStore = require("./tenant-store");

  async function activeHardenedProfile(environmentId) {
    if (!environmentId) return null;
    const row = await store.findOneOptional("deployment_profiles", { environment_id: environmentId });
    if (!row || row.status !== "active") return null;
    const profile = String(row.profile || "").toUpperCase();
    return ["PRODUCTION", "SOVEREIGN"].includes(profile) ? profile : null;
  }

  async function govern(input) {
    const auth = input && input.auth;
    const orgId = auth && auth.org && auth.org.id;
    const environmentId = auth && auth.environment && auth.environment.id;
    const hardened = await activeHardenedProfile(environmentId);
    if (hardened) {
      try { await tenantStore.assertRuntimeScope({ org_id: orgId, environment_id: environmentId }); }
      catch (error) {
        return {
          ok: true, verdict: "BLOCK", engine_verdict: "NOT_EVALUATED",
          mode: auth && auth.environment && auth.environment.mode || "enforce",
          enforced: false, recorded: false,
          record_error: error && error.message || "tenant scope proof failed",
          reason: `${hardened} denied execution because the RLS tenant/environment boundary could not be proven`,
          production_posture: "BLOCKED",
        };
      }
    }
    if (hardened && !store.durable()) {
      return {
        ok: true, verdict: "BLOCK", engine_verdict: "NOT_EVALUATED",
        mode: auth.environment.mode || "enforce", enforced: false, recorded: false,
        record_error: "durable evidence backend unavailable",
        reason: `${hardened} requires durable evidence before executable decisions are returned`,
        production_posture: "BLOCKED",
      };
    }

    const result = await base.govern(input);
    if (!hardened) return result;
    if (!result || result.recorded !== true || !result.decision_id) {
      return {
        ...(result || {}), ok: true, verdict: "BLOCK", enforced: false, recorded: false,
        reason: `${hardened} blocked execution because durable decision evidence was not committed`,
        production_posture: "BLOCKED",
      };
    }
    return { ...result, production_posture: "READY" };
  }

  return { ...base, govern, activeHardenedProfile };
}

module.exports = { wrapGovernanceGateway };
