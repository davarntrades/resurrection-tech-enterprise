/* ============================================================================
 * Operations Agent — Runtime Governance gate (the trust boundary).
 *
 * The agent is NOT trusted. Every proposed action is converted into a synthetic
 * one-step trajectory (tool name + flags matching operations_rules.py) and
 * submitted to the EXISTING Morrison governance engine via lib/runtime/engine
 * BEFORE anything executes. The engine remains the final authority:
 *
 *   PERMIT                    → allow (low/medium risk) or escalate (high/
 *                               critical risk: deployment policy requires a
 *                               human sign-off even on a permitted action)
 *   BLOCK / NO_VALID_SOLUTION → block, always — never downgraded locally
 *   ESCALATE / ENV_SENSITIVE  → escalate (human review)
 *   engine unreachable/error  → block (fail-closed; an ungoverned action is
 *                               never executed)
 *
 * Operator approval is not a bypass: it re-evaluates the SAME action with the
 * catalog's authorisation flags attached, so the permit is issued by the
 * engine's own Ω rules, and the approving operator is recorded in evidence.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const actions = require("./actions");

// Ω domains carrying the internal-operations deployment rules.
const OPS_DOMAINS = ["enterprise", "compliance", "data_privacy"];
const HORIZON = 3;

const VERDICTS = ["allow", "block", "escalate"];

// Ω rules whose BLOCK means "missing operator authorisation" — an operator
// sign-off cures them (the approval attaches the flag and the engine itself
// then permits). An unapproved proposal tripping one of these ESCALATES to
// the operator instead of dead-ending. Unconditional rules (evidence
// destruction, credential sharing) are NOT here: they block, always.
const AUTHORIZATION_RULES = new Set([
  "ops_unauthorized_report_delivery",
  "ops_unauthorized_deployment",
  "ops_unauthorized_org_creation",
  "ops_unauthorized_pilot_promotion",
  "ops_unauthorized_customer_modification",
  "ops_unauthorized_document_export",
  "ops_unauthorized_autonomy_change",
]);

// Build the synthetic Ω trajectory for a proposed action. Flags travel inside
// `args` — the engine spreads args into the state the Ω rules see.
function trajectoryFor(action, params = {}, approval = null) {
  const args = {
    actor: "operations_agent",
    agent: "resurrection-tech-ops-agent",
    ...(params.flags || {}),
    ...(approval ? action.approval_flags : {}),
    ...(approval && approval.actor ? { approved_by: String(approval.actor) } : {}),
  };
  return [{ tool: action.tool, args }];
}

function mapEngineVerdict(v) {
  if (v === "PERMIT") return "allow";
  if (v === "BLOCK" || v === "NO_VALID_SOLUTION") return "block";
  return "escalate"; // ESCALATE / ENVIRONMENT_SENSITIVE → human review
}

/**
 * Evaluate a proposed action. Returns a decision record:
 * { verdict, policy, reason, risk, rule, omega_domain, trajectory_hash,
 *   engine: {reachable, verdict, layer}, evaluated_at }
 */
async function evaluate({ action_id, params = {}, approval = null }) {
  const action = actions.get(action_id);
  const base = { action_id, evaluated_at: rt.store.nowISO(), risk: action ? action.risk : null };

  // Unknown action → deny-by-default, no engine round trip needed.
  if (!action) {
    return { ...base, verdict: "block", policy: "unknown_action", reason: `action ${JSON.stringify(action_id)} is not in the operations catalog`, rule: null, omega_domain: null, trajectory_hash: null, engine: { reachable: null, verdict: null } };
  }

  const trajectory = trajectoryFor(action, params, approval);
  const res = await rt.engine.evaluate(trajectory, OPS_DOMAINS, HORIZON);

  // Fail-closed: no engine verdict → no execution, ever.
  if (!res.ok || !res.json) {
    return {
      ...base, verdict: "block", policy: "fail_closed_engine_unavailable",
      reason: `Runtime Governance engine unavailable (${res.error || `HTTP ${res.status}`}) — agent actions are blocked until governance is reachable`,
      rule: null, omega_domain: null, trajectory_hash: null,
      engine: { reachable: false, verdict: null, error: res.error || `HTTP ${res.status}` },
    };
  }

  const g = res.json;
  let verdict = mapEngineVerdict(g.verdict);
  let policy = "engine_verdict";
  const rule = (g.metadata && g.metadata.rule) || null;

  // A BLOCK from a deny-by-default authorisation rule on an UNAPPROVED
  // proposal escalates to the operator — approval re-evaluates with the
  // catalog's flags and the engine issues its own permit. With an approval
  // already attached, a remaining BLOCK is final.
  if (verdict === "block" && !approval && rule && AUTHORIZATION_RULES.has(rule)) {
    verdict = "escalate";
    policy = "authorization_required";
  }

  // Deployment policy floor: a PERMIT on a high/critical-risk action still
  // requires a human sign-off unless this evaluation carries an approval.
  if (verdict === "allow" && !approval && !actions.autoExecutable(action)) {
    verdict = "escalate";
    policy = "human_signoff_required";
  }
  // Refuse-class actions are never executed even if a future ruleset permits.
  if (action.refuse && verdict === "allow") {
    verdict = "block";
    policy = "platform_refusal";
  }

  return {
    ...base,
    verdict, policy,
    reason: policy === "human_signoff_required"
      ? `engine permitted, but ${action.risk}-risk operations require operator approval before execution`
      : policy === "authorization_required"
        ? `engine requires explicit operator authorisation (${rule}) — escalated for sign-off`
        : (g.reason || g.verdict),
    rule,
    omega_domain: g.omega_domain || null,
    trajectory_hash: g.trajectory_hash || null,
    engine: {
      reachable: true, verdict: g.verdict, layer: g.layer || null,
      eval_time_ms: (g.metadata && g.metadata.eval_time_ms) || null,
      attestation: g.attestation || null,
    },
  };
}

module.exports = { evaluate, trajectoryFor, mapEngineVerdict, OPS_DOMAINS, VERDICTS, AUTHORIZATION_RULES };
