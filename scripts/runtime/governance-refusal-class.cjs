"use strict";

/* Why a governed run refused to execute.
 *
 * THE TRAP THIS EXISTS TO AVOID
 *
 * `runtime_governance_decision` reads "blocked" in two completely different
 * situations, because the gateway records BOTH as a block — correctly, since
 * refusing to execute IS a block and fail-closed must stay fail-closed:
 *
 *   lib/runtime/integration-gateway.js, governFn threw (engine unreachable):
 *     return { ok:false, code:"GOVERNANCE_UNAVAILABLE", governance:{ status:"blocked" } }
 *
 *   lib/runtime/integration-gateway.js, engine evaluated and refused:
 *     const code = ... "GOVERNANCE_BLOCKED"     governance:{ status:"blocked" }
 *
 * So classifying on the decision field alone cannot tell a policy refusal from
 * an outage — it will call every outage a policy decision. Observed directly:
 * run cmr_00c799fc9da83abbe2 reported decision "blocked" with
 * governance_verdict null, governance_rule null, and safe_failure_reason
 * "governance_unavailable | GOVERNANCE_UNAVAILABLE: ...". No rule fired; the
 * engine was never reached.
 *
 * The discriminator that DOES survive is `safe_failure_reason`, whose prefix is
 * written by classifyFailure() in lib/runtime/communication-runs.js:
 *
 *     GOVERNANCE_UNAVAILABLE           -> "governance_unavailable"
 *     GOVERNANCE_BLOCKED | _ESCALATED  -> "governance_decision"
 *     APPROVAL_*                       -> "approval"
 *     CONNECTOR_*                      -> "connector"
 *
 * Hence the ordering below: infrastructure is tested FIRST, because it is the
 * case the decision field actively disguises.
 *
 * This module classifies. It never decides whether the run passes — every
 * class below is still a failure to the caller.
 */

const INFRASTRUCTURE = "GOVERNANCE OR CONNECTOR UNAVAILABLE (infrastructure) — the engine was not reached, so no rule was evaluated";
const POLICY = "GOVERNANCE REFUSED (policy) — see rule above";
const APPROVAL = "AWAITING OPERATOR APPROVAL (workflow), not a policy refusal";
const UNCLASSIFIED = "UNCLASSIFIED — inspect the fields above";

const text = (value) => String(value == null ? "" : value);

/** Did the engine actually evaluate, or was it never reached? */
function isUnavailable(run) {
  const reason = text(run.safe_failure_reason);
  if (/GOVERNANCE_UNAVAILABLE/i.test(reason)) return true;
  if (/^\s*governance_unavailable\b/i.test(reason)) return true;
  if (text(run.runtime_governance_decision).toLowerCase() === "unavailable") return true;
  return false;
}

/** Is the run parked waiting for a human, rather than refused? */
function isAwaitingApproval(run) {
  const approval = text(run.approval_status).toLowerCase();
  if (["escalated", "pending", "awaiting_approval"].includes(approval)) return true;
  return text(run.workflow_status).toLowerCase() === "awaiting_approval";
}

/**
 * Classify why the run did not execute.
 *
 * Returns { class, label }, where `class` is a stable machine token and
 * `label` is the operator-facing sentence. Order is load-bearing — see above.
 */
function classifyRefusal(run = {}) {
  if (isUnavailable(run)) return { class: "infrastructure", label: INFRASTRUCTURE };
  if (isAwaitingApproval(run)) return { class: "approval", label: APPROVAL };

  const decision = text(run.runtime_governance_decision).toLowerCase();
  if (["blocked", "denied", "rejected"].includes(decision)) {
    return { class: "policy", label: POLICY };
  }
  return { class: "unclassified", label: UNCLASSIFIED };
}

module.exports = {
  classifyRefusal, isUnavailable, isAwaitingApproval,
  INFRASTRUCTURE, POLICY, APPROVAL, UNCLASSIFIED,
};
