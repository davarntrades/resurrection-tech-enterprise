/* ============================================================================
 * Production posture wrapper for the existing runtime governance gateway.
 *
 * Morrison/kernel semantics are untouched. This wrapper only tightens the
 * enterprise contract around the decision: once an environment has ACTIVATED
 * PRODUCTION or SOVEREIGN, a caller can never receive an executable ALLOW when
 * durable evidence was unavailable.
 *
 * Legacy environment variables remain meaningful for development/pilot paths;
 * they cannot weaken an active production profile.
 * ============================================================================ */
"use strict";

function wrapGovernanceGateway(base, store) {
  if (!base || !store) throw new Error("base gateway + store are required");

  async function activeHardenedProfile(environmentId) {
    if (!environmentId) return null;
    const row = await store.findOneOptional("deployment_profiles", { environment_id: environmentId });
    if (!row || row.status !== "active") return null;
    const profile = String(row.profile || "").toUpperCase();
    return ["PRODUCTION", "SOVEREIGN"].includes(profile) ? profile : null;
  }

  async function govern(input) {
    const environmentId = input && input.auth && input.auth.environment && input.auth.environment.id;
    const hardened = await activeHardenedProfile(environmentId);
    if (hardened && !store.durable()) {
      return {
        ok: true,
        verdict: "BLOCK",
        engine_verdict: "NOT_EVALUATED",
        mode: input.auth.environment.mode || "enforce",
        enforced: false,
        recorded: false,
        record_error: "durable evidence backend unavailable",
        reason: `${hardened} requires durable evidence before executable decisions are returned`,
        production_posture: "BLOCKED",
      };
    }

    const result = await base.govern(input);
    if (!hardened) return result;

    // This is deliberately after the existing gateway has attempted its normal
    // append. The wrapper does not change the decision algorithm; it changes
    // only whether an unrecorded decision may be acted upon in production.
    if (!result || result.recorded !== true || !result.decision_id) {
      return {
        ...(result || {}),
        ok: true,
        verdict: "BLOCK",
        enforced: false,
        recorded: false,
        reason: `${hardened} blocked execution because durable decision evidence was not committed`,
        production_posture: "BLOCKED",
      };
    }
    return { ...result, production_posture: "READY" };
  }

  return { ...base, govern, activeHardenedProfile };
}

module.exports = { wrapGovernanceGateway };
