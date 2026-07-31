/* ============================================================================
 * GuardianOS — step-level Runtime Governance middleware.
 *
 * Moves governance from "one decision per provider invocation" to "one decision
 * per workflow step", so an agent is governed at every point where it chooses to
 * act — not only where it happens to call a model.
 *
 * WHY A SESSION ACCUMULATES A TRAJECTORY
 * --------------------------------------
 * The obvious implementation — evaluate each step in isolation via
 * /v1/evaluate-step — would be a governance REGRESSION dressed as a feature.
 * The whole value of Ω reachability is that a sequence of individually benign
 * steps can reach a forbidden state: read customer record → summarise → send
 * externally is three innocuous steps and one exfiltration. Judging each step
 * alone cannot see that; only the accumulated trajectory can.
 *
 * So a governed session carries its trajectory forward and every step is
 * evaluated against the WHOLE sequence so far, at the configured horizon.
 *
 * HOW THIS STAYS ADDITIVE
 * -----------------------
 * The existing proposal lifecycle remains the authority and is not modified:
 * every step still goes through ops.proposals.propose → governor → engine →
 * evidence, exactly as a provider invocation does today. The session
 * reachability check is an ADDITIONAL, DENY-ONLY gate layered on top:
 *
 *   final verdict = most restrictive of (proposal verdict, trajectory verdict)
 *
 * It can turn an allow into a block. It can never turn a block into an allow,
 * and it never reaches a provider. With no session, governStep degenerates to
 * exactly the call the Integration Gateway makes today, which is what lets the
 * Bedrock path migrate onto this middleware with byte-identical behaviour.
 * ============================================================================ */
"use strict";

const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");
const store = require("./store");
const engine = require("./engine");

const VERDICTS = ["allow", "escalate", "block"]; // ascending restrictiveness
const TERMINAL_SESSION = new Set(["completed", "blocked", "abandoned", "failed"]);
const DEFAULT_DOMAINS = ["enterprise", "compliance", "data_privacy"];
const DEFAULT_HORIZON = 3;
const MAX_STEPS = Number(process.env.STEP_GOVERNANCE_MAX_STEPS || 250);

const now = () => store.nowISO();
const elapsed = (started) => Math.max(0, Math.round(performance.now() - started));
const hash = (value) => store.sha256(typeof value === "string" ? value : JSON.stringify(value));
const clean = (value, max = 400) => String(value == null ? "" : value).slice(0, max);
const id = (prefix) => `${prefix}_${crypto.randomBytes(9).toString("hex")}`;

/** Most restrictive of two verdicts. Never downgrades. */
function strictest(a, b) {
  const rank = (v) => Math.max(0, VERDICTS.indexOf(String(v)));
  return rank(a) >= rank(b) ? a : b;
}

function fail(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

/* ── Sessions ─────────────────────────────────────────────────────────────
 * A session is one governed workflow run: an organisation, an environment, an
 * ordered trajectory and the evidence chain that links its steps. */

async function openSession(input = {}) {
  if (!input.org_id || !input.environment_id) throw fail("SESSION_SCOPE_REQUIRED", "organisation and environment are required");
  const environment = await store.findOne("environments", { id: input.environment_id });
  if (!environment || environment.org_id !== input.org_id) throw fail("SESSION_SCOPE_INVALID", "environment not found for this organisation", 404);
  const idempotency_key = clean(input.idempotency_key || `session-${crypto.randomUUID()}`, 240);
  const existing = await store.findOneOptional("governed_sessions", { org_id: input.org_id, idempotency_key });
  if (existing) return safeSession(existing);
  const row = await store.insert("governed_sessions", {
    id: id("gvs"),
    org_id: input.org_id,
    environment_id: input.environment_id,
    workflow: clean(input.workflow, 160) || "governed_workflow",
    actor: clean(input.actor, 160) || "guardianos_sdk",
    correlation_id: clean(input.correlation_id, 200) || null,
    domains: Array.isArray(input.domains) && input.domains.length ? input.domains.map((d) => clean(d, 60)) : DEFAULT_DOMAINS,
    horizon: Number.isFinite(Number(input.horizon)) ? Math.max(1, Math.min(10, Number(input.horizon))) : DEFAULT_HORIZON,
    trajectory: [],
    step_count: 0,
    allowed_count: 0,
    blocked_count: 0,
    escalated_count: 0,
    status: "open",
    idempotency_key,
    evidence_id: null,
    trajectory_hash: null,
    created_at: now(),
    updated_at: now(),
  });
  return safeSession(row);
}

function safeSession(row) {
  if (!row) return null;
  return row;
}

async function getSession(session_id, org_id) {
  const row = await store.findOne("governed_sessions", { id: session_id });
  if (!row || row.org_id !== org_id) throw fail("SESSION_NOT_FOUND", "governed session not found for this organisation", 404);
  return row;
}

/* ── The step gate ────────────────────────────────────────────────────────── */

/**
 * Govern one workflow step.
 *
 * Without `session_id` this is exactly the governed proposal the Integration
 * Gateway already creates — same action, same params, same lifecycle, same
 * evidence. With a session it additionally evaluates the accumulated trajectory
 * and takes the more restrictive of the two verdicts.
 *
 * Returns { verdict, allowed, proposal_id, evidence_id, ... } and NEVER
 * executes anything: the caller acts only on `allowed === true`.
 */
async function governStep(action_id, input = {}) {
  const ops = require("../ops");
  const started = performance.now();
  const { session_id = null, org_id, environment_id = null, actor = "guardianos_sdk", params = {} } = input;

  let session = null;
  let trajectoryDecision = null;
  let stepIndex = null;

  if (session_id) {
    session = await getSession(session_id, org_id);
    if (TERMINAL_SESSION.has(session.status)) throw fail("SESSION_CLOSED", `governed session is ${session.status}`, 409);
    if (environment_id && environment_id !== session.environment_id) throw fail("SESSION_ENVIRONMENT_MISMATCH", "step environment does not match the session environment", 409);
    if (Number(session.step_count || 0) >= MAX_STEPS) throw fail("SESSION_STEP_LIMIT", `governed session exceeded ${MAX_STEPS} steps`, 409);
    stepIndex = Number(session.step_count || 0);
    trajectoryDecision = await evaluateTrajectory(session, action_id, input);
  }

  // The existing proposal lifecycle remains the authority. Untouched.
  //
  // CRITICAL ORDERING: propose() EXECUTES an allowed action immediately. If the
  // accumulated trajectory has already refused this step, the proposal must be
  // created and governed but must NOT run — otherwise the side effect lands
  // before the trajectory verdict is applied and the gate is decorative. The
  // lifecycle's existing `hold` path does exactly that: it records a fully
  // governed proposal and withholds execution, without any change to the
  // lifecycle itself.
  const withhold = !!trajectoryDecision && trajectoryDecision.verdict !== "allow";
  const proposal = await ops.proposals.propose({
    action_id,
    org_id,
    environment_id: environment_id || (session && session.environment_id) || null,
    params: { ...params, org_id, environment_id: environment_id || (session && session.environment_id) || null, actor },
    source: `step_governance:${actor}`,
    hold: withhold,
  });

  // What the proposal path decided ON ITS OWN. When the trajectory gate forced a
  // hold, the lifecycle records decision.held and reports `escalated`; the
  // underlying proposal verdict was `allow`, and the audit record must say so —
  // otherwise it looks like the proposal refused the step when in fact the
  // trajectory did, and `restricted_by_trajectory` would never be true.
  const held = !!(proposal.decision && proposal.decision.held);
  const proposalVerdict = held ? "allow"
    : proposal.status === "executed" || proposal.status === "allowed" ? "allow"
      : proposal.status === "escalated" ? "escalate" : "block";
  const verdict = trajectoryDecision ? strictest(proposalVerdict, trajectoryDecision.verdict) : proposalVerdict;
  const restrictedByTrajectory = !!trajectoryDecision && verdict !== proposalVerdict;

  const record = {
    session_id: session ? session.id : null,
    step_index: stepIndex,
    action_id,
    verdict,
    allowed: verdict === "allow",
    proposal_id: proposal.id,
    proposal_status: proposal.status,
    proposal_verdict: proposalVerdict,
    trajectory_verdict: trajectoryDecision ? trajectoryDecision.verdict : null,
    trajectory_rule: trajectoryDecision ? trajectoryDecision.rule : null,
    trajectory_hash: trajectoryDecision ? trajectoryDecision.trajectory_hash : (proposal.decision && proposal.decision.trajectory_hash) || null,
    restricted_by_trajectory: restrictedByTrajectory,
    decision: proposal.decision || null,
    evidence_id: proposal.evidence_id || null,
    governance_latency_ms: elapsed(started),
    // A step is executable only on a full allow, and only when the proposal
    // itself executed — an escalation is never a permit.
    execution: proposal.execution || null,
  };

  if (session) await recordStep(session, action_id, input, record, trajectoryDecision);
  return record;
}

/* Evaluate the accumulated trajectory INCLUDING the candidate step. Deny-only:
 * an engine failure here blocks, it never permits. */
async function evaluateTrajectory(session, action_id, input) {
  const ops = require("../ops");
  const catalog = ops.actions.get(action_id);
  const tool = catalog ? catalog.tool : clean(action_id, 120);
  const args = {
    actor: clean(input.actor, 120) || "guardianos_sdk",
    ...(input.params && input.params.flags ? input.params.flags : {}),
  };
  const candidate = { tool, args };
  const trajectory = [...(Array.isArray(session.trajectory) ? session.trajectory : []), candidate];
  const result = await engine.evaluate(trajectory, session.domains || DEFAULT_DOMAINS, session.horizon || DEFAULT_HORIZON);
  if (!result.ok || !result.json) {
    return {
      verdict: "block", reason: `Runtime Governance unavailable (${result.error || `HTTP ${result.status}`}) — the step is blocked`,
      rule: null, trajectory_hash: null, engine_verdict: null, trajectory,
    };
  }
  const g = result.json;
  const verdict = g.verdict === "PERMIT" ? "allow" : (g.verdict === "BLOCK" || g.verdict === "NO_VALID_SOLUTION") ? "block" : "escalate";
  return {
    verdict,
    reason: g.reason || g.verdict,
    rule: (g.metadata && g.metadata.rule) || null,
    omega_domain: g.omega_domain || null,
    trajectory_hash: g.trajectory_hash || null,
    engine_verdict: g.verdict,
    attestation: g.attestation || null,
    engine_compute_ms: g.engine_compute_ms ?? null,
    trajectory,
    candidate,
  };
}

/* Persist the step and advance the session. The trajectory only grows with
 * ALLOWED steps: a blocked step never happened, so letting it contaminate the
 * sequence would poison every later evaluation. */
async function recordStep(session, action_id, input, record, trajectoryDecision) {
  const step = await store.insert("governed_steps", {
    id: id("gvst"),
    org_id: session.org_id,
    environment_id: session.environment_id,
    session_id: session.id,
    step_index: record.step_index,
    action_id,
    tool: trajectoryDecision && trajectoryDecision.candidate ? trajectoryDecision.candidate.tool : clean(action_id, 120),
    // The exact Ω args this step was judged with. Governance metadata only —
    // flags and actor, never customer content — and REQUIRED for replay: without
    // it a blocked step cannot be faithfully re-evaluated.
    args: trajectoryDecision && trajectoryDecision.candidate ? trajectoryDecision.candidate.args : {},
    verdict: record.verdict,
    proposal_id: record.proposal_id,
    proposal_status: record.proposal_status,
    proposal_verdict: record.proposal_verdict,
    trajectory_verdict: record.trajectory_verdict,
    trajectory_rule: record.trajectory_rule,
    trajectory_hash: record.trajectory_hash,
    restricted_by_trajectory: record.restricted_by_trajectory,
    engine_verdict: trajectoryDecision ? trajectoryDecision.engine_verdict : null,
    engine_compute_ms: trajectoryDecision ? trajectoryDecision.engine_compute_ms : null,
    attestation: trajectoryDecision ? trajectoryDecision.attestation : null,
    evidence_id: record.evidence_id,
    governance_latency_ms: record.governance_latency_ms,
    params_hash: hash(input.params || {}),
    created_at: now(),
  });
  const allowed = record.verdict === "allow";
  const trajectory = allowed && trajectoryDecision ? trajectoryDecision.trajectory : (session.trajectory || []);
  await store.update("governed_sessions", session.id, {
    trajectory,
    step_count: Number(session.step_count || 0) + 1,
    allowed_count: Number(session.allowed_count || 0) + (allowed ? 1 : 0),
    blocked_count: Number(session.blocked_count || 0) + (record.verdict === "block" ? 1 : 0),
    escalated_count: Number(session.escalated_count || 0) + (record.verdict === "escalate" ? 1 : 0),
    trajectory_hash: record.trajectory_hash || session.trajectory_hash,
    // A blocked step ends the session: the agent proposed something the
    // trajectory cannot contain, so continuing it is not a governed workflow.
    status: record.verdict === "block" ? "blocked" : session.status,
    updated_at: now(),
  });
  record.step_id = step.id;
  return step;
}

/* ── Session close + replay ───────────────────────────────────────────────── */

async function closeSession(session_id, org_id, { status = "completed", summary = null } = {}) {
  const session = await getSession(session_id, org_id);
  const steps = await listSteps(session_id, org_id);
  const evidence = await store.insert("integration_events", {
    org_id: session.org_id,
    environment_id: session.environment_id,
    type: "governance.session.completed",
    actor: session.actor,
    immutable: true,
    occurred_at: now(),
    evidence: {
      session_id: session.id,
      workflow: session.workflow,
      correlation_id: session.correlation_id,
      status: TERMINAL_SESSION.has(session.status) ? session.status : status,
      domains: session.domains,
      horizon: session.horizon,
      step_count: steps.length,
      allowed: steps.filter((s) => s.verdict === "allow").length,
      blocked: steps.filter((s) => s.verdict === "block").length,
      escalated: steps.filter((s) => s.verdict === "escalate").length,
      // The replayable spine: every step's engine verdict and trajectory hash,
      // in order, each linked to the proposal and evidence it produced.
      steps: steps.map((s) => ({
        step_index: s.step_index, action_id: s.action_id, tool: s.tool, verdict: s.verdict,
        proposal_id: s.proposal_id, evidence_id: s.evidence_id,
        trajectory_hash: s.trajectory_hash, engine_verdict: s.engine_verdict,
        restricted_by_trajectory: s.restricted_by_trajectory,
      })),
      summary: summary || null,
    },
    evidence_hash: hash({ session_id: session.id, steps: steps.map((s) => [s.step_index, s.verdict, s.trajectory_hash]) }),
  });
  await store.update("governed_sessions", session.id, {
    status: TERMINAL_SESSION.has(session.status) ? session.status : status,
    evidence_id: evidence.id,
    closed_at: now(),
    updated_at: now(),
  });
  return { ...(await getSession(session_id, org_id)), evidence_id: evidence.id };
}

async function listSteps(session_id, org_id) {
  const rows = await store.findOptional("governed_steps", { org_id, session_id });
  return rows.sort((a, b) => Number(a.step_index) - Number(b.step_index));
}

/**
 * Replay a governed session: re-evaluate the recorded trajectory prefix for
 * every step and confirm the engine still returns the same verdict and hash.
 * Deterministic replay is what makes the audit record defensible.
 */
async function replaySession(session_id, org_id) {
  const session = await getSession(session_id, org_id);
  const steps = await listSteps(session_id, org_id);
  const trajectory = [];
  const results = [];
  for (const step of steps) {
    trajectory.push({ tool: step.tool, args: step.args || { actor: session.actor } });
    const result = await engine.evaluate(trajectory, session.domains || DEFAULT_DOMAINS, session.horizon || DEFAULT_HORIZON);
    const engineVerdict = result.ok && result.json ? result.json.verdict : null;
    const trajectoryHash = result.ok && result.json ? result.json.trajectory_hash : null;
    results.push({
      step_index: step.step_index,
      recorded_verdict: step.engine_verdict,
      replayed_verdict: engineVerdict,
      recorded_hash: step.trajectory_hash,
      replayed_hash: trajectoryHash,
      deterministic: !!engineVerdict && engineVerdict === step.engine_verdict
        && (!step.trajectory_hash || step.trajectory_hash === trajectoryHash),
    });
    if (step.verdict !== "allow") break; // a blocked step never entered the trajectory
  }
  return {
    session_id: session.id,
    steps: results,
    deterministic: results.length > 0 && results.every((r) => r.deterministic),
    replayed_at: now(),
  };
}

async function recentSessions(org_id, environment_id = null, limit = 25) {
  const rows = await store.findOptional("governed_sessions", { org_id });
  return rows
    .filter((row) => !environment_id || row.environment_id === environment_id)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, Math.max(1, Math.min(100, limit)));
}

module.exports = {
  VERDICTS, DEFAULT_DOMAINS, DEFAULT_HORIZON, MAX_STEPS,
  openSession, getSession, governStep, closeSession, listSteps, replaySession, recentSessions, strictest,
};
