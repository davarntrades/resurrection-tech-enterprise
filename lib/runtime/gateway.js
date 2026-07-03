/* ============================================================================
 * Runtime Governance — the continuous-governance gateway.
 *
 * The single entry point a customer's agents call in production. It wraps the
 * EXISTING engine (never modifies it) and adds the enterprise layer:
 *   • authenticate (org + environment + role, via API key)
 *   • evaluate the trajectory through the live engine → ALLOW / ESCALATE / BLOCK
 *   • honour the environment's MODE:
 *        shadow  → observe only; caller is always allowed to proceed, but the
 *                  would-be verdict is recorded (safe rollout / dry-run)
 *        enforce → the verdict is authoritative (BLOCK actually blocks)
 *   • persist a decision row = the runtime evidence + audit-log entry
 *     (metadata only: verdict, Ω domain, rule, hash, latency, tools — never the
 *      raw customer payload/args)
 *
 * Returns the effective decision to the caller plus the recorded evidence id.
 * ============================================================================ */
"use strict";
const store = require("./store");
const engine = require("./engine");
const admin = require("./admin");

function normVerdict(v) {
  v = String(v || "").toUpperCase();
  if (/BLOCK|DENY/.test(v)) return "BLOCK";
  if (/ESCALATE|HUMAN_REVIEW|REVIEW/.test(v)) return "ESCALATE";
  if (/PERMIT|ALLOW/.test(v)) return "ALLOW";
  return v || "UNKNOWN";
}
const toolNames = (trajectory) => (trajectory || []).map((s) => (s && s.tool) || "").filter(Boolean);

// Ingest + govern one trajectory. `auth` is the result of admin.authenticate().
// Records a decision and returns the effective outcome.
async function govern({ auth, trajectory, domains, horizon, label, agent, correlation_id }) {
  if (!auth || !auth.org) return { ok: false, error: "unauthenticated" };
  if (!Array.isArray(trajectory) || !trajectory.length) return { ok: false, error: "trajectory required" };
  const org = auth.org;
  const environment = auth.environment || (await admin.listEnvironments(org.id)).find((e) => e.kind === "production");
  if (!environment) return { ok: false, error: "no environment for org" };
  const mode = environment.mode || "shadow";

  const t0 = process.hrtime.bigint();
  const res = await engine.evaluate(trajectory, domains, horizon);
  const round_trip_ms = Number(process.hrtime.bigint() - t0) / 1e6;

  let engineVerdict, omega_domain = null, rule = null, reason = "", trajectory_hash = null, engine_compute_ms = null, requires_human_review = false, engine_ok = res.ok;
  if (res.ok && res.json) {
    const j = res.json;
    engineVerdict = normVerdict(j.verdict);
    omega_domain = j.omega_domain || null;
    rule = (j.metadata && j.metadata.rule) || null;
    reason = j.reason || "";
    trajectory_hash = j.trajectory_hash || null;
    engine_compute_ms = typeof j.engine_compute_ms === "number" ? j.engine_compute_ms : null;
    requires_human_review = !!j.requires_human_review || engineVerdict === "ESCALATE";
  } else {
    // Engine unreachable → fail CLOSED in enforce mode, OPEN (observe) in shadow.
    engineVerdict = "ENGINE_UNAVAILABLE";
    reason = res.error || `engine HTTP ${res.status}`;
  }

  // Effective verdict after applying the environment mode.
  let effective;
  if (mode === "shadow") effective = "ALLOW";                             // observe only
  else if (engineVerdict === "ENGINE_UNAVAILABLE") effective = "BLOCK";   // fail closed in enforce
  else effective = engineVerdict;
  const enforced = mode === "enforce" && engine_ok;

  const decision = await store.appendDecision({
    org_id: org.id, environment_id: environment.id, environment_kind: environment.kind,
    mode, enforced,
    engine_verdict: engineVerdict, verdict: effective, requires_human_review,
    omega_domain, rule, reason: String(reason).slice(0, 300),
    trajectory_hash, engine_compute_ms, round_trip_ms: +round_trip_ms.toFixed(3),
    steps: trajectory.length, tools: toolNames(trajectory), domains: domains || null,
    label: label || null, agent: agent || null, correlation_id: correlation_id || null,
    engine_ok,
    // Full trajectory retained ONLY when the environment opts in (store_payloads)
    // — enables exact, determinism-provable replay. Off by default (privacy).
    trajectory_full: environment.store_payloads ? trajectory : null,
  });

  return {
    ok: true,
    verdict: effective,                 // what the caller should do
    engine_verdict: engineVerdict,      // what the engine actually said
    mode, enforced, requires_human_review,
    omega_domain, rule, reason: decision.reason, trajectory_hash,
    engine_compute_ms, round_trip_ms: decision.round_trip_ms,
    decision_id: decision.id, recorded_at: decision.created_at,
    review: res.ok && res.json ? res.json.review || null : null,
  };
}

// Decision replay: re-run a stored decision's trajectory tools through the
// engine and compare to the recorded verdict/hash — proves determinism and
// lets an auditor reproduce any historical decision. (Args aren't stored, so
// replay re-evaluates the tool sequence; the trajectory_hash comparison is the
// determinism check on the stored shape.)
async function replayDecision(decision_id) {
  const rows = await store.queryDecisions({ limit: 100000 });
  const dec = rows.find((r) => r.id === decision_id);
  if (!dec) return { ok: false, error: "decision not found" };
  // Exact replay when the full trajectory was retained (store_payloads on);
  // otherwise a shape-only replay of the tool sequence (args weren't stored).
  const exact = Array.isArray(dec.trajectory_full) && dec.trajectory_full.length > 0;
  const trajectory = exact ? dec.trajectory_full : (dec.tools || []).map((t) => ({ tool: t, args: {} }));
  const res = await engine.evaluate(trajectory, dec.domains || undefined);
  const replayVerdict = res.ok && res.json ? normVerdict(res.json.verdict) : "ENGINE_UNAVAILABLE";
  const replayHash = res.ok && res.json ? res.json.trajectory_hash : null;
  return {
    ok: true, decision_id, replay_mode: exact ? "exact" : "shape_only",
    original: { verdict: dec.engine_verdict, trajectory_hash: dec.trajectory_hash },
    replay: { verdict: replayVerdict, trajectory_hash: replayHash },
    // Determinism is only asserted for an EXACT replay; a shape-only replay
    // cannot reproduce args-dependent verdicts and says so.
    deterministic: exact ? (!!replayHash && replayHash === dec.trajectory_hash && replayVerdict === dec.engine_verdict) : null,
    hash_matches: !!replayHash && replayHash === dec.trajectory_hash,
    verdict_matches: replayVerdict === dec.engine_verdict,
    note: exact ? "exact replay of retained trajectory" : "shape-only replay — args not retained (enable store_payloads for exact reproduction)",
  };
}

module.exports = { govern, replayDecision, normVerdict };
