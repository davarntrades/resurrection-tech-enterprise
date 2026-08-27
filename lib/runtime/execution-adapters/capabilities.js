"use strict";

const CAPABILITIES = Object.freeze([
  "pre_execution_hook", "state_read", "state_write", "state_diff", "replay",
  "multi_step", "permission_control", "policy_context", "deterministic_reset",
  "execution_receipts", "idempotency", "streaming", "mcp", "http", "cli",
]);

const READINESS = Object.freeze({
  FULL_ENFORCEMENT_READY: "FULL_ENFORCEMENT_READY",
  PARTIAL_OBSERVABILITY: "PARTIAL_OBSERVABILITY",
  REPLAY_ONLY: "REPLAY_ONLY",
  NO_PRE_EXECUTION_HOOK: "NO_PRE_EXECUTION_HOOK",
  INSUFFICIENT_FOR_LOCAL_SAFETY_CLAIM: "INSUFFICIENT_FOR_LOCAL_SAFETY_CLAIM",
});

function normalizeCapabilities(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return Object.fromEntries(CAPABILITIES.map((key) => [key, source[key] === true]));
}

function assessSafetyClaimReadiness(input = {}) {
  const c = normalizeCapabilities(input);
  if (c.pre_execution_hook && c.state_read && c.state_write && c.execution_receipts) {
    return {
      level: READINESS.FULL_ENFORCEMENT_READY,
      supports_local_safety_experiment: true,
      can_establish_comparable_initial_state: c.deterministic_reset || c.replay,
      reason: "The integration exposes a governed pre-execution boundary, observable state, state-changing execution and receipts.",
    };
  }
  if (c.pre_execution_hook && (c.execution_receipts || c.state_write)) {
    return {
      level: READINESS.PARTIAL_OBSERVABILITY,
      supports_local_safety_experiment: false,
      can_establish_comparable_initial_state: false,
      reason: "Pre-execution control exists, but state or receipt evidence is incomplete; prevention/execution claims must remain qualified.",
    };
  }
  if (c.replay && !c.pre_execution_hook) {
    return {
      level: READINESS.REPLAY_ONLY,
      supports_local_safety_experiment: false,
      can_establish_comparable_initial_state: c.deterministic_reset,
      reason: "The environment can replay observations but does not expose a controllable pre-execution boundary.",
    };
  }
  if (!c.pre_execution_hook && (c.http || c.mcp || c.cli || c.state_write)) {
    return {
      level: READINESS.NO_PRE_EXECUTION_HOOK,
      supports_local_safety_experiment: false,
      can_establish_comparable_initial_state: false,
      reason: "An execution surface exists, but Morrison cannot be placed at a verified pre-execution boundary.",
    };
  }
  return {
    level: READINESS.INSUFFICIENT_FOR_LOCAL_SAFETY_CLAIM,
    supports_local_safety_experiment: false,
    can_establish_comparable_initial_state: false,
    reason: "The declared capabilities are insufficient to support a local-safety experiment.",
  };
}

module.exports = { CAPABILITIES, READINESS, normalizeCapabilities, assessSafetyClaimReadiness };
