/** Runtime Governance — finite-model verification surface (read-only).
 *
 * This is a VIEW over evidence produced elsewhere. It computes no verdict, runs
 * no enumeration and writes nothing. Its whole job is to show four different
 * kinds of evidence WITHOUT letting them merge into one another:
 *
 *   1. VERIFICATION      what a finite-model enumeration established, inside a
 *                        declared model, under stated assumptions.
 *   2. RUNTIME GOVERNANCE what the engine actually decided about real proposed
 *                        actions, and whether the evidence chain holds.
 *   3. INTEGRITY / DRIFT  whether the configuration running now is the one that
 *                        was verified.
 *   4. COUNTEREXAMPLES    prohibited states the verifier reached, and runtime
 *                        events worth an operator's attention.
 *
 * There is deliberately NO aggregate "status" field. A finite-model result, a
 * runtime governance status, pilot operational evidence and universal safety
 * are four different claims, and a single green light would assert a fifth one
 * that nothing here supports. Callers that want a summary must render the four
 * classes separately.
 *
 * WHAT THIS DEPLOYMENT CAN AND CANNOT CONFIRM. The artifact's own internal
 * digest is a SHA-256 over canonically-serialised JSON produced by the Python
 * verifier. Node cannot reproduce that serialisation faithfully — Python emits
 * `120.0` where JSON.stringify emits `120`, and the artifacts contain floats —
 * so this module does NOT claim to re-verify it. What it does verify, and what
 * IS reproducible byte-for-byte in both languages, is a SHA-256 over the stored
 * artifact bytes: that detects tampering after ingestion. The producer's own
 * validation result is shown as REPORTED, never as confirmed here, and the
 * command to re-check it independently is included in the payload.
 */

const crypto = require("crypto");
const store = require("./store");

const STATE = {
  VERIFIED: "verified",   // independently confirmed by this deployment
  REPORTED: "reported",   // the producing system's own claim, not re-checked here
  DEGRADED: "degraded",   // checked, and not in the state it should be
  UNKNOWN: "unknown",     // could not be established — never means "probably fine"
};

const COLLECTION = "verification_artifacts";

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Newest-first, and never throws: a missing table reads UNKNOWN, not empty. */
async function loadArtifacts(filter = {}) {
  const rows = await store.findOptional(COLLECTION, filter);
  if (!Array.isArray(rows)) return null;
  return [...rows].sort((a, b) =>
    String(b.ingested_at || "").localeCompare(String(a.ingested_at || "")));
}

function parseArtifact(row) {
  if (!row) return null;
  const raw = typeof row.artifact === "string" ? row.artifact : null;
  if (raw === null) return { row, raw: null, doc: row.artifact || null, bytes_ok: null };
  let doc = null;
  try { doc = JSON.parse(raw); } catch { doc = null; }
  const recomputed = sha256(Buffer.from(raw, "utf8"));
  return {
    row, raw, doc,
    recomputed_sha256: recomputed,
    stored_sha256: row.content_sha256 || null,
    // The one integrity property this deployment can establish on its own.
    bytes_ok: row.content_sha256 ? recomputed === row.content_sha256 : null,
  };
}

/* ── 1. VERIFICATION ─────────────────────────────────────────────────────── */

function verificationClass(parsed) {
  if (!parsed || !parsed.doc) {
    return {
      state: STATE.UNKNOWN,
      summary: "No finite-model verification artifact has been ingested for " +
               "this deployment. Nothing is claimed.",
      artifact: null,
    };
  }
  const d = parsed.doc;
  const fv = d.finite_verification || {};
  const complete = fv.complete_enumeration === true;
  const verdict = fv.verdict || null;
  // A verification is only shown as VERIFIED-by-us when the bytes we hold match
  // what was ingested. The VERDICT itself is always the producer's claim.
  const state = parsed.bytes_ok === true
    ? STATE.VERIFIED
    : (parsed.bytes_ok === false ? STATE.DEGRADED : STATE.UNKNOWN);
  return {
    state,
    summary: parsed.bytes_ok === false
      ? "The stored artifact does not match the hash recorded when it was " +
        "ingested. Treat its contents as untrustworthy."
      : "Stored artifact integrity is confirmed by this deployment. The " +
        "verdict below is the verifier's claim, scoped to its declared model.",
    artifact: {
      verification_id: d.verification_id || null,
      schema_version: d.schema_version || null,
      model_identity: {
        name: (d.environment || {}).name || null,
        version: (d.environment || {}).version || null,
        model_hash: (d.environment || {}).model_hash || null,
        transition_relation_id: (d.environment || {}).transition_relation_id || null,
        perturbation: (d.environment || {}).perturbation || null,
      },
      ruleset_hash: (d.governance || {}).ruleset_hash || null,
      engine_version: (d.governance || {}).engine_version || null,
      environment_identity: parsed.row.environment_id || null,
      verifier: d.verifier || null,
      repository_commit: (d.verifier || {}).repository_commit || null,
      verdict,
      complete_enumeration: complete,
      escalation_outcomes_admitted:
        (d.traversal || {}).escalation_outcomes_admitted || [],
      last_verification: parsed.row.ingested_at || d.timestamp || null,
      assumptions: d.assumptions || [],
      limitations: d.limitations || [],
      scope: fv.scope || null,
      claim: fv.claim || null,
    },
    producer_reported: {
      artifact_hash: ((d.artifact_integrity || {}).artifact_hash) || null,
      model_digest: ((d.artifact_integrity || {}).model_digest) || null,
      validation: parsed.row.producer_validation || null,
      note: "Reported by the system that produced the artifact. NOT re-checked " +
            "by this deployment — see independent_recheck.",
    },
    independent_recheck: {
      stored_bytes_sha256: parsed.recomputed_sha256 || null,
      matches_ingested_hash: parsed.bytes_ok,
      what_this_confirms: "Only that the artifact stored here is byte-identical " +
        "to the one ingested. It does not confirm the enumeration happened.",
      how_to_verify_fully:
        "python -m morrison_governance.global_verification.ci_gate  (re-runs the " +
        "enumeration at the recorded commit), or validate_verification_artifact() " +
        "on this document.",
    },
  };
}

/* ── 2. RUNTIME GOVERNANCE ───────────────────────────────────────────────── */

async function runtimeGovernanceClass(filter = {}) {
  let decisions = null;
  try {
    decisions = await store.queryDecisions({ ...filter, limit: 500 });
  } catch {
    decisions = null;
  }
  if (!Array.isArray(decisions)) {
    return {
      state: STATE.UNKNOWN,
      summary: "Runtime decisions could not be read. No conclusion is drawn.",
      counts: null, evidence_chain: null,
    };
  }
  const counts = { PERMIT: 0, BLOCK: 0, ESCALATE: 0, other: 0 };
  let executed = 0, unresolved_escalation = 0;
  for (const row of decisions) {
    const verdict = String(row.verdict || row.decision || "").toUpperCase();
    if (verdict in counts) counts[verdict] += 1; else counts.other += 1;
    if (row.executed === true) executed += 1;
    // An ESCALATE that never reached an execution is unresolved as far as the
    // record shows. Surfaced separately from BLOCK on purpose: they are not
    // the same governance event and must not be summed.
    if (verdict === "ESCALATE" && row.executed !== true) unresolved_escalation += 1;
  }
  let chain = null;
  if (filter.org_id && filter.environment_id) {
    try { chain = await store.verifyChain(filter.org_id, filter.environment_id); }
    catch { chain = null; }
  }
  return {
    state: chain && chain.ok === false ? STATE.DEGRADED
      : (chain ? STATE.VERIFIED : STATE.REPORTED),
    summary: "What the engine decided about real proposed actions. This is " +
             "operational evidence, not a reachability proof.",
    actions_evaluated: decisions.length,
    counts,
    execution_decisions: { executed, not_executed: decisions.length - executed },
    unresolved_escalation,
    evidence_chain: chain,
  };
}

/* ── 3. INTEGRITY / DRIFT ────────────────────────────────────────────────── */

function driftClass(parsed, live) {
  if (!parsed || !parsed.doc) {
    return {
      state: STATE.UNKNOWN,
      summary: "No verification to compare the running configuration against.",
      revalidation_required: true,
      dimensions: [],
    };
  }
  const d = parsed.doc;
  const dims = [];
  const push = (dimension, verified, observed, note) => dims.push({
    dimension,
    matches: observed != null && verified != null && String(observed) === String(verified),
    verified: verified ?? null,
    observed: observed ?? null,
    note,
  });
  const l = live || {};
  push("ruleset", (d.governance || {}).ruleset_hash, l.ruleset_hash,
       "A different ruleset decides differently, so a prior verification does not describe it.");
  push("engine", (d.governance || {}).engine_version, l.engine_version,
       "Engine version stamped on live verdicts.");
  push("model", (d.environment || {}).model_hash, l.model_hash,
       "The declared finite model the verification ran against.");
  push("environment", parsed.row.environment_id, l.environment_id,
       "A different environment is a different reachable graph.");
  // Sets, not sequences: sort both sides so a reordered inventory is not
  // reported as drift, while an added or removed entry still is.
  const asSet = (v) => (Array.isArray(v) ? JSON.stringify([...v].sort()) : null);
  push("tools", asSet(parsed.row.verified_tools), asSet(l.tools),
       "A tool the model never enumerated is outside the verification.");
  push("permissions", asSet(parsed.row.verified_permissions), asSet(l.permissions),
       "Permissions change which transitions are available.");

  const drifted = dims.filter((x) => !x.matches);
  const unreadable = dims.filter((x) => x.observed == null);
  return {
    state: drifted.length ? STATE.DEGRADED : STATE.VERIFIED,
    summary: drifted.length
      ? "Verification no longer matches current configuration — revalidation required."
      : "The running configuration matches the one that was verified.",
    revalidation_required: drifted.length > 0,
    freshness: {
      last_verification: parsed.row.ingested_at || d.timestamp || null,
      repository_commit: (d.verifier || {}).repository_commit || null,
    },
    unreadable_dimensions: unreadable.map((x) => x.dimension),
    dimensions: dims,
    note: unreadable.length
      ? "A dimension that cannot be read counts as NOT matching. It is never " +
        "assumed to be unchanged."
      : null,
  };
}

/* ── 4. COUNTEREXAMPLES / INCIDENTS ──────────────────────────────────────── */

function counterexampleClass(parsed, runtime) {
  const out = {
    state: STATE.UNKNOWN,
    summary: "No verification artifact, so no modelled counterexample is known.",
    modelled: null,
    runtime_events: null,
  };
  if (parsed && parsed.doc) {
    const governed = ((parsed.doc.control_comparison || {}).governed) || {};
    const ce = governed.counterexample || null;
    out.state = (governed.unsafe_reachable_state_count || 0) > 0
      ? STATE.DEGRADED : STATE.VERIFIED;
    out.summary = (governed.unsafe_reachable_state_count || 0) > 0
      ? "A prohibited state is reachable inside the declared model."
      : "No prohibited state was reachable inside the declared model.";
    out.modelled = {
      unsafe_reachable_states: governed.unsafe_reachable_state_count || 0,
      unsafe_reachable_transitions: governed.unsafe_reachable_edge_count || 0,
      blocked_transitions: governed.blocked_edge_count || 0,
      // BLOCK and ESCALATE are different governance events and are never summed.
      blocked_into_prohibited: governed.blocked_unsafe_edge_count || 0,
      escalations_denied: governed.denied_escalation_edge_count || 0,
      escalations_approved_and_executed:
        governed.approved_escalation_edge_count || 0,
      shortest_unsafe_path: governed.shortest_unsafe_path ?? null,
      counterexample_path: ce ? (ce.steps || []).map((s) => ({
        action: s.action,
        governance_verdict: s.governance_verdict,
        escalation_outcome: s.escalation_outcome ?? null,
        resulting_state_id: s.resulting_state_id,
        unsafe_invariants: s.unsafe_invariants || [],
      })) : null,
      violated_invariants: ce ? (ce.violated_invariants || []) : [],
    };
  }
  if (runtime && runtime.counts) {
    out.runtime_events = {
      blocked: runtime.counts.BLOCK || 0,
      escalated: runtime.counts.ESCALATE || 0,
      unresolved_escalation: runtime.unresolved_escalation || 0,
      note: "Runtime governance events. These are observations of real " +
            "proposed actions, NOT reachability results, and they neither " +
            "confirm nor extend the finite-model verdict.",
    };
  }
  return out;
}

/* ── the surface ─────────────────────────────────────────────────────────── */

async function status({ org_id, environment_id, live } = {}) {
  const filter = {};
  if (org_id) filter.org_id = org_id;
  if (environment_id) filter.environment_id = environment_id;

  const rows = await loadArtifacts(filter);
  const parsed = rows && rows.length ? parseArtifact(rows[0]) : null;
  const runtime = await runtimeGovernanceClass(filter);

  return {
    generated_at: store.nowISO(),
    store: { backend: store.backend(), durable: store.durable() },
    artifacts_held: rows === null ? null : rows.length,
    classes: {
      verification: verificationClass(parsed),
      runtime_governance: runtime,
      integrity_drift: driftClass(parsed, live),
      counterexamples: counterexampleClass(parsed, runtime),
    },
    legend: {
      verified: "Independently confirmed by this deployment.",
      reported: "The producing system's own claim. Not re-checked here.",
      degraded: "Checked, and not in the state it should be.",
      unknown: "Could not be established. Never means the control is probably present.",
    },
    separation_notice: [
      "These four classes are different claims and are not combined.",
      "A finite-model result is not a runtime governance status.",
      "A runtime governance status is not pilot operational evidence.",
      "None of them is a claim of universal or open-world safety.",
      "There is deliberately no single overall indicator on this surface.",
    ],
    notes: [
      "This surface is read-only and is a view over evidence produced " +
        "elsewhere. It computes no verdict of its own.",
      "A finite-model verdict holds within its declared model and stated " +
        "assumptions only.",
      "Runtime observations never become reachability proofs.",
      "BLOCK and ESCALATE are reported separately and are never summed.",
    ],
  };
}

module.exports = { status, STATE, COLLECTION, parseArtifact, loadArtifacts };
