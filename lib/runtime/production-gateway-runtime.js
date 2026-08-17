/* ============================================================================
 * Production execution posture wrapper.
 *
 * Adds a readiness gate AROUND the existing Integration Gateway. It does not
 * alter Morrison decisions. Pilot profiles are passed through unchanged.
 * Production/Sovereign profiles are fail-closed before an executable connector
 * can reach its provider runtime if readiness is not READY.
 * ============================================================================ */
"use strict";

function wrapProductionGateway(base, store) {
  if (!base || !store) throw new Error("base gateway + store are required");
  const profiles = require("./deployment-profiles");
  const readiness = require("./production-readiness");

  async function gate(input = {}) {
    const org_id = input.org_id;
    const environment_id = input.environment_id;
    if (!org_id || !environment_id) return { allowed: true, profile: profiles.PROFILE.GUARDED_PILOT };
    const profile = await profiles.executionProfile({ org_id, environment_id });
    const row = await profiles.current(environment_id);
    return readiness.assertProductionExecutionAllowed({
      profile,
      sovereign: profile === profiles.PROFILE.SOVEREIGN ? {
        customer_secret_store: row && row.config && (row.config.customer_secret_store || row.config.secret_store_ref),
        customer_evidence_store: row && row.config && row.config.evidence_store_ref,
        sovereign_profile: row && row.config && row.config.sovereign_profile || "sovereign",
      } : {},
    });
  }

  const guarded = [
    "invokeBedrock",
    "invokeFirstClassConnector",
    "sendCommunication",
    "readCommunication",
    "deliverWebhookRaw",
  ];
  const wrapped = { ...base };
  for (const name of guarded) {
    if (typeof base[name] !== "function") continue;
    wrapped[name] = async function productionGuardedCall(input, ...rest) {
      await gate(input || {});
      return base[name](input, ...rest);
    };
  }
  wrapped.productionExecutionGate = gate;
  return wrapped;
}

module.exports = { wrapProductionGateway };
