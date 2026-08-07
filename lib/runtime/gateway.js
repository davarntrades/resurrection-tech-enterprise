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
const log = require("./log");
const ratelimit = require("./ratelimit");

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

  // L5 — per-key rate limiting (no-op unless RUNTIME_RATE_LIMIT is set).
  const rl = ratelimit.check(auth.key_id);
  if (!rl.allowed) {
    log.warn("rate_limited", { org_id: org.id, key_id: auth.key_id, retry_after_ms: rl.retry_after_ms });
    return { ok: false, error: "rate_limited", status: 429, retry_after_ms: rl.retry_after_ms };
  }
  // Default is ENFORCE. It was "shadow", and every environment — production
  // included — was created in shadow, so an unconfigured deployment allowed
  // everything while recording that it would have blocked.
  const mode = environment.mode || "enforce";

  // Item 5: refuse live customer traffic on the non-durable dev file store when
  // the operator has required a durable backend (RUNTIME_REQUIRE_DURABLE). Off
  // by default so local/CI runs on the file store are unaffected.
  if (String(process.env.RUNTIME_REQUIRE_DURABLE || "").match(/^(1|true|yes)$/i) && !store.durable()) {
    return { ok: false, error: "durable store required for live traffic — configure Supabase (see supabase/governance_runtime.sql); refusing to record evidence to the non-durable file store" };
  }

  const t0 = process.hrtime.bigint();
  // KERNEL PATH. Identity is forwarded so the engine binds the decision to a
  // real principal + tenant instead of treating the call as anonymous.
  const res = await engine.govern(trajectory, domains, horizon, undefined, {
    principal: `org:${org.id}`, tenant: org.id,
  });
  const round_trip_ms = Number(process.hrtime.bigint() - t0) / 1e6;

  let engineVerdict, omega_domain = null, rule = null, reason = "", trajectory_hash = null, engine_compute_ms = null, requires_human_review = false, engine_ok = res.ok;
  // Item 2: engine provenance — the exact ruleset/version that produced the
  // verdict, captured verbatim from the engine response (attestation). Stored
  // on every decision so evidence is defensible and replay drift is detectable
  // months later. The gateway never invents these — it records what the engine
  // returned.
  let attestation = null, engine_commit = null, ruleset_hash = null, engine_service_version = null;
  if (res.ok && res.json) {
    const j = res.json;
    engineVerdict = normVerdict(j.verdict);
    omega_domain = j.omega_domain || null;
    rule = (j.metadata && j.metadata.rule) || null;
    reason = j.reason || "";
    trajectory_hash = j.trajectory_hash || null;
    engine_compute_ms = typeof j.engine_compute_ms === "number" ? j.engine_compute_ms : null;
    requires_human_review = !!j.requires_human_review || engineVerdict === "ESCALATE";
    attestation = j.attestation || null;
    if (attestation) { engine_commit = attestation.engine_commit || null; ruleset_hash = attestation.ruleset_hash || null; engine_service_version = attestation.service_version || null; }
  } else {
    // Engine unreachable → fail CLOSED in enforce mode, OPEN (observe) in shadow.
    engineVerdict = "ENGINE_UNAVAILABLE";
    reason = res.error || `engine HTTP ${res.status}`;
  }

  // Effective verdict after applying the environment mode.
  //
  // SHADOW NO LONGER OVERRIDES A HARD VERDICT. It used to return ALLOW
  // unconditionally, so a kernel BLOCK on `drop_database` was recorded and then
  // waved through — a governance layer that observed its own bypass. Shadow now
  // only annotates: it can never turn BLOCK or ESCALATE into ALLOW.
  //
  // What shadow still means: `enforced` stays false, so downstream reporting can
  // distinguish a dry-run environment from a live one. What it no longer means:
  // permission to proceed past a hard verdict.
  //
  // Engine unavailable is BLOCK in BOTH modes — an unreachable guard is not
  // evidence of safety.
  let effective;
  if (engineVerdict === "ENGINE_UNAVAILABLE") effective = "BLOCK";
  else effective = engineVerdict;
  const enforced = mode === "enforce" && engine_ok;
  const shadow_observed_only = mode === "shadow";

  const decisionRow = {
    org_id: org.id, environment_id: environment.id, environment_kind: environment.kind,
    mode, enforced, shadow_observed_only,
    engine_verdict: engineVerdict, verdict: effective, requires_human_review,
    omega_domain, rule, reason: String(reason).slice(0, 300),
    trajectory_hash, engine_compute_ms, round_trip_ms: +round_trip_ms.toFixed(3),
    steps: trajectory.length, tools: toolNames(trajectory), domains: domains || null,
    label: label || null, agent: agent || null, correlation_id: correlation_id || null,
    engine_ok,
    // Engine provenance (item 2) — the exact ruleset + version behind this verdict.
    engine_commit, ruleset_hash, engine_service_version, attestation,
    // Full trajectory retained ONLY when the environment opts in (store_payloads)
    // — enables exact, determinism-provable replay. Off by default (privacy).
    trajectory_full: environment.store_payloads ? trajectory : null,
  };

  // L2 — store-failure resilience. Persistence must not take down the request
  // path or lose the governance DECISION. On a store outage we still return the
  // verdict, flag the evidence gap loudly (log + counter), and — only if the
  // operator demands evidence integrity (RUNTIME_REQUIRE_RECORD) — fail closed.
  let decision = null, recorded = true, record_error = null;
  try {
    decision = await store.appendDecision(decisionRow);
  } catch (e) {
    recorded = false; record_error = (e && e.message) || String(e);
    log.error("decision_record_failed", { org_id: org.id, environment_id: environment.id, verdict: effective, engine_verdict: engineVerdict, error: record_error });
    // Phase 3 — real-time alert on the evidence gap (fire-and-forget; throttled).
    try { require("./alerts").raise({ org_id: org.id, environment_id: environment.id, kind: "record_failure", message: `Decision not recorded: ${record_error}`, meta: { verdict: effective } }); } catch { /* alerting must never break govern() */ }
    if (/^(1|true|yes)$/i.test(String(process.env.RUNTIME_REQUIRE_RECORD || ""))) {
      return { ok: true, verdict: "BLOCK", engine_verdict: engineVerdict, mode, enforced: false, recorded: false, record_error,
        reason: "evidence could not be recorded and RUNTIME_REQUIRE_RECORD is set — failing closed", requires_human_review };
    }
    decision = { id: null, created_at: new Date().toISOString(), reason: decisionRow.reason };
  }

  // L1 — one structured audit line per decision (metadata only, never raw args).
  log.info("decision", {
    decision_id: decision.id, org_id: org.id, environment_id: environment.id, environment_kind: environment.kind,
    mode, enforced, shadow_observed_only, verdict: effective, engine_verdict: engineVerdict, omega_domain, rule,
    engine_compute_ms, round_trip_ms: +round_trip_ms.toFixed(3), ruleset_hash, recorded, correlation_id: correlation_id || null,
  });

  return {
    ok: true,
    verdict: effective,                 // what the caller should do
    engine_verdict: engineVerdict,      // what the engine actually said
    mode, enforced, shadow_observed_only, requires_human_review,
    omega_domain, rule, reason: decision.reason, trajectory_hash,
    engine_compute_ms, round_trip_ms: decisionRow.round_trip_ms,
    engine_commit, ruleset_hash,           // provenance surfaced to the caller
    decision_id: decision.id, recorded, record_error, recorded_at: decision.created_at,
    review: res.ok && res.json ? res.json.review || null : null,
  };
}

// Decision replay: re-run a stored decision's trajectory tools through the
// engine and compare to the recorded verdict/hash — proves determinism and
// lets an auditor reproduce any historical decision. (Args aren't stored, so
// replay re-evaluates the tool sequence; the trajectory_hash comparison is the
// determinism check on the stored shape.)
async function replayDecision(decision_id) {
  // Item 4: indexed single-decision lookup (PK on Supabase, early-exit scan on
  // the dev file store) — no more full-table load-and-.find().
  const dec = await store.getDecisionById(decision_id);
  if (!dec) return { ok: false, error: "decision not found" };
  // Exact replay when the full trajectory was retained (store_payloads on);
  // otherwise a shape-only replay of the tool sequence (args weren't stored).
  const exact = Array.isArray(dec.trajectory_full) && dec.trajectory_full.length > 0;
  const trajectory = exact ? dec.trajectory_full : (dec.tools || []).map((t) => ({ tool: t, args: {} }));
  const res = await engine.evaluate(trajectory, dec.domains || undefined);
  const replayVerdict = res.ok && res.json ? normVerdict(res.json.verdict) : "ENGINE_UNAVAILABLE";
  const replayHash = res.ok && res.json ? res.json.trajectory_hash : null;
  const replayRuleset = res.ok && res.json && res.json.attestation ? res.json.attestation.ruleset_hash || null : null;
  // Engine-drift detection (item 2 provenance in action): if the current engine
  // ruleset differs from the one that produced the stored decision, a verdict
  // difference is EXPECTED — flag it instead of silently reporting a mismatch.
  const engine_drift = !!(dec.ruleset_hash && replayRuleset && dec.ruleset_hash !== replayRuleset);
  return {
    ok: true, decision_id, replay_mode: exact ? "exact" : "shape_only",
    original: { verdict: dec.engine_verdict, trajectory_hash: dec.trajectory_hash, ruleset_hash: dec.ruleset_hash || null, engine_commit: dec.engine_commit || null },
    replay: { verdict: replayVerdict, trajectory_hash: replayHash, ruleset_hash: replayRuleset },
    engine_drift,
    // Determinism is only asserted for an EXACT replay against the SAME ruleset;
    // a shape-only replay (or a drifted engine) cannot make that claim.
    deterministic: exact && !engine_drift ? (!!replayHash && replayHash === dec.trajectory_hash && replayVerdict === dec.engine_verdict) : null,
    hash_matches: !!replayHash && replayHash === dec.trajectory_hash,
    verdict_matches: replayVerdict === dec.engine_verdict,
    note: engine_drift ? "engine ruleset has changed since this decision — verdict differences are attributable to the engine version, not the platform"
      : exact ? "exact replay of retained trajectory against the same ruleset"
      : "shape-only replay — args not retained (enable store_payloads for exact reproduction)",
  };
}

module.exports = { govern, replayDecision, normVerdict };
