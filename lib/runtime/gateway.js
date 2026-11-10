/* ============================================================================
 * Runtime Governance — the continuous-governance gateway.
 *
 * The single entry point a customer's agents call in production. It wraps the
 * EXISTING engine (never modifies it) and adds the enterprise layer:
 *   • authenticate (org + environment + role, via API key)
 *   • evaluate the trajectory through the live engine → ALLOW / ESCALATE / BLOCK
 *   • honour the environment's OPERATING MODE (see resolveMode):
 *        shadow  → enforcement INACTIVE. The caller's existing execution path
 *                  is never interrupted: the returned verdict is always ALLOW,
 *                  the would-be verdict is recorded and returned alongside,
 *                  and a governance outage is recorded, not enforced. A shadow
 *                  ALLOW never authorises Morrison's own execution adapters.
 *        enforce → enforcement ACTIVE. The strictest verdict is authoritative,
 *                  an engine outage is BLOCK, and an unrecorded decision fails
 *                  closed. Missing or unrecognised modes resolve to enforce:
 *                  nothing silently downgrades enforcement to shadow.
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

// The operating mode of an environment. Only an explicit "shadow" is shadow:
// a missing mode, or any value other than "shadow"/"enforce", resolves to
// ENFORCE and says so, so a typo or a missing column can never silently turn
// enforcement off.
function resolveMode(environment) {
  const raw = environment && environment.mode;
  if (raw === "shadow" || raw === "enforce") return { mode: raw, mode_source: "configured" };
  if (raw === undefined || raw === null || raw === "") return { mode: "enforce", mode_source: "default" };
  return { mode: "enforce", mode_source: "invalid" };
}

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
  const { mode, mode_source } = resolveMode(environment);
  if (mode_source === "invalid") {
    log.warn("invalid_environment_mode", { org_id: org.id, environment_id: environment.id, configured: environment.mode, resolved: mode });
  }

  // Item 5: refuse live customer traffic on the non-durable dev file store when
  // the operator has required a durable backend (RUNTIME_REQUIRE_DURABLE). Off
  // by default so local/CI runs on the file store are unaffected. In SHADOW
  // the customer is still never interrupted: the gap is returned, not enforced.
  if (String(process.env.RUNTIME_REQUIRE_DURABLE || "").match(/^(1|true|yes)$/i) && !store.durable()) {
    const error = "durable store required for live traffic — configure Supabase (see supabase/governance_runtime.sql); refusing to record evidence to the non-durable file store";
    if (mode === "shadow") {
      log.error("shadow_evaluation_failed", { org_id: org.id, environment_id: environment.id, error });
      return { ok: true, verdict: "ALLOW", would_be_verdict: null, operating_mode: "shadow", mode, enforced: false,
        enforcement_active: false, shadow_observed_only: true, evaluation_failed: true, evaluation_error: error,
        recorded: false, decision_id: null };
    }
    return { ok: false, error };
  }

  const t0 = process.hrtime.bigint();
  // KERNEL PATH. Identity is forwarded so the engine binds the decision to a
  // real principal + tenant instead of treating the call as anonymous.
  const res = await engine.govern(trajectory, domains, horizon, undefined, {
    principal: `org:${org.id}`, tenant: org.id,
  });
  const round_trip_ms = Number(process.hrtime.bigint() - t0) / 1e6;

  let engineVerdict, omega_domain = null, rule = null, reason = "", trajectory_hash = null, engine_compute_ms = null, requires_human_review = false, engine_ok = res.ok;
  /* Measured governance timing.
   *
   * FOUR DIFFERENT THINGS, kept separate on purpose. Collapsing them is what
   * made the Control Room advertise a whole request handler as "Avg engine":
   *
   *   engine_time_ms     Ω reachability compute alone
   *   decision_time_ms   the governed decision — the kernel pipeline
   *                      (canonicalisation, trust boundary, capability policy,
   *                      engine, tenancy, evidence sealing)
   *   engine_compute_ms  the whole SERVICE HANDLER, as /v1/govern reports it
   *   round_trip_ms      Node → service → Node, including network
   *
   * Each is a superset of the one above it. `engine_compute_ms` keeps its name
   * because it is bound into the decision hash chain (store.chainCore) and
   * cannot be renamed without invalidating history — but it is no longer
   * PRESENTED as engine compute anywhere.
   *
   * Every field stays null when the service did not report it. A service
   * predating the timing passthrough yields nulls, never zeros: an absent
   * measurement is not a measurement of zero. */
  let decision_time_ms = null, engine_time_ms = null,
      trajectory_decision_time_ms = null, eval_number = null,
      stage_timings_ms = null;
  // Item 2: engine provenance — the exact ruleset/version that produced the
  // verdict, captured verbatim from the engine response (attestation). Stored
  // on every decision so evidence is defensible and replay drift is detectable
  // months later. The gateway never invents these — it records what the engine
  // returned.
  let attestation = null, engine_commit = null, ruleset_hash = null, engine_service_version = null;
  let governed_result = null, engine_evidence = null, governance_layer = null, execution_occurred = null;
  if (res.ok && res.json) {
    const j = res.json;
    engineVerdict = normVerdict(j.verdict);
    omega_domain = j.omega_domain || null;
    rule = (j.metadata && j.metadata.rule) || null;
    reason = j.reason || "";
    trajectory_hash = j.trajectory_hash || null;
    engine_compute_ms = typeof j.engine_compute_ms === "number" ? j.engine_compute_ms : null;
    // Kernel-measured timing from /v1/govern metadata. `num` rejects
    // non-numbers rather than coercing, so a malformed payload cannot inject a
    // fabricated 0 — but a genuine 0 (e.g. an `unattributed` remainder that
    // rounds to zero) is a real measurement and is preserved.
    const m = j.metadata || {};
    const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    decision_time_ms = num(m.decision_time_ms) ?? num(m.eval_time_ms);
    engine_time_ms = num(m.engine_time_ms);
    trajectory_decision_time_ms = num(m.trajectory_decision_time_ms);
    eval_number = num(m.eval_number);
    if (m.stage_timings_ms && typeof m.stage_timings_ms === "object"
        && !Array.isArray(m.stage_timings_ms)) {
      const entries = Object.entries(m.stage_timings_ms)
        .map(([k, v]) => [k, num(v)])
        .filter(([, v]) => v !== null);
      if (entries.length) stage_timings_ms = Object.fromEntries(entries);
    }
    // The service reports the STRICTEST verdict across the trajectory; a
    // service predating that field reported the last step, so prefer the
    // explicit field when present.
    if (j.strictest_verdict) engineVerdict = normVerdict(j.strictest_verdict);
    requires_human_review = !!j.requires_human_review || engineVerdict === "ESCALATE";
    attestation = j.attestation || null;
    governed_result = j.governed_result || null;
    engine_evidence = j.evidence && typeof j.evidence === "object" ? {
      verified: j.evidence.verified, records: j.evidence.records, head: j.evidence.head,
    } : null;
    governance_layer = j.layer || governed_result?.canonical_governance?.responsible_layer || null;
    execution_occurred = typeof governed_result?.canonical_governance?.execution_occurred === "boolean"
      ? governed_result.canonical_governance.execution_occurred : null;
    if (attestation) { engine_commit = attestation.engine_commit || null; ruleset_hash = attestation.ruleset_hash || null; engine_service_version = attestation.service_version || null; }
  } else {
    // Engine unreachable → fail CLOSED in enforce mode, OPEN (observe) in shadow.
    engineVerdict = "ENGINE_UNAVAILABLE";
    reason = res.error || `engine HTTP ${res.status}`;
  }

  // Effective verdict after applying the operating mode.
  //
  // ENFORCE: the engine's (strictest) verdict is authoritative, and an
  // unreachable or failed engine is BLOCK — an unreachable guard is not
  // evidence of safety.
  //
  // SHADOW: enforcement is inactive. The caller is told ALLOW so its existing
  // execution path is never interrupted, including during a governance
  // outage; the verdict Morrison WOULD have enforced is recorded and returned
  // as `would_be_verdict`. This is only ever reached when the environment's
  // mode is explicitly "shadow" (resolveMode). Commit 3e817cb had removed the
  // observe-only behaviour because production environments were being
  // CREATED in shadow by default; that default is enforce, so shadow now means
  // what an operator who chose it expects.
  const evaluation_failed = engineVerdict === "ENGINE_UNAVAILABLE";
  const enforced = mode === "enforce";
  const enforcement_active = enforced;
  const shadow_observed_only = mode === "shadow";
  const would_be_verdict = evaluation_failed ? null : engineVerdict;
  let effective;
  if (shadow_observed_only) effective = "ALLOW";
  else if (evaluation_failed) effective = "BLOCK";
  else effective = engineVerdict;
  if (shadow_observed_only && evaluation_failed) {
    log.error("shadow_evaluation_failed", { org_id: org.id, environment_id: environment.id, error: reason });
    try { require("./alerts").raise({ org_id: org.id, environment_id: environment.id, kind: "shadow_evaluation_failed", message: `Shadow evaluation failed: ${reason}`, meta: {} }); } catch { /* alerting never breaks govern() */ }
  }

  const decisionRow = {
    org_id: org.id, environment_id: environment.id, environment_kind: environment.kind,
    mode, enforced, shadow_observed_only, mode_source,
    enforcement_active, would_be_verdict, evaluation_failed,
    engine_verdict: engineVerdict, verdict: effective, requires_human_review,
    omega_domain, rule, reason: String(reason).slice(0, 300),
    trajectory_hash, engine_compute_ms, round_trip_ms: +round_trip_ms.toFixed(3),
    // Additive timing (nullable). Dropped by store.appendDecision when the
    // migration is pending, and outside chainCore so the hash chain is
    // unaffected either way.
    decision_time_ms, engine_time_ms, trajectory_decision_time_ms,
    eval_number, stage_timings_ms,
    governed_result, engine_evidence, governance_layer, execution_occurred,
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
    // ENFORCE fails closed on an unrecorded decision unless the operator has
    // explicitly accepted unrecorded decisions (RUNTIME_ALLOW_UNRECORDED). It
    // used to require opting IN (RUNTIME_REQUIRE_RECORD); a decision with no
    // evidence is not an authorisation anyone can later account for.
    const allowUnrecorded = /^(1|true|yes)$/i.test(String(process.env.RUNTIME_ALLOW_UNRECORDED || ""));
    if (enforced && !allowUnrecorded) {
      return { ok: true, verdict: "BLOCK", engine_verdict: engineVerdict, would_be_verdict, mode, operating_mode: mode,
        enforced, enforcement_active, shadow_observed_only, recorded: false, record_error, decision_id: null,
        reason: "evidence could not be recorded — enforcement fails closed (set RUNTIME_ALLOW_UNRECORDED to accept unrecorded decisions)", requires_human_review };
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
    would_be_verdict,                   // what enforcement would do (null if evaluation failed)
    operating_mode: mode, mode_source,
    enforcement_active, evaluation_failed,
    evaluation_error: evaluation_failed ? reason : null,
    mode, enforced, shadow_observed_only, requires_human_review,
    local_verdict: res.ok && res.json ? res.json.local_verdict || null : null,
    global_verdict: res.ok && res.json ? res.json.global_verdict || null : null,
    authorized_action_hashes: res.ok && res.json && Array.isArray(res.json.decisions)
      ? res.json.decisions.map((d) => d && d.action_hash || null) : null,
    omega_domain, rule, reason: decision.reason, trajectory_hash,
    engine_compute_ms, round_trip_ms: decisionRow.round_trip_ms,
    // Surfaced to the caller so a live Control Room evaluation can show the
    // governed decision cost without waiting on the decisions table.
    decision_time_ms, engine_time_ms, trajectory_decision_time_ms,
    eval_number, stage_timings_ms,
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

module.exports = { govern, replayDecision, normVerdict, resolveMode };
