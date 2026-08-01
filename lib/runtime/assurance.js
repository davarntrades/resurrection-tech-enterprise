/* ============================================================================
 * Runtime Governance — Runtime Assurance Status.
 *
 * WHAT THIS IS. A read-only report on whether the platform's assurance controls
 * are actually in force in THIS deployment. It answers, for an operator looking
 * at the Control Room, the question the audit could previously only answer by
 * hand: are the fail-closed switches on, and is append-only enforcement really
 * installed in this database?
 *
 * WHAT THIS IS NOT. It governs nothing, executes nothing, writes nothing, and
 * has no counterpart that enables or disables a control. Every control here is
 * configured outside the application — environment variables set in the
 * deployment, and a migration applied to the database — and that is deliberate:
 * a governance control that the governed system can switch off from its own
 * admin UI is not a control.
 *
 * THE ONE RULE. A control is never reported as present because it ought to be.
 * Every path that cannot establish a control's state reports `unknown` or
 * `degraded`, never `active` or `verified`. This is the whole reason the module
 * exists — the previous situation was that RUNTIME_REQUIRE_RECORD had no
 * surface at all, so an operator's only option was to assume.
 *
 * STATES
 *   active     an operator switch is on (environment variables)
 *   inactive   an operator switch is off — a fact, not an error
 *   verified   checked against the real system and found correct
 *   degraded   checked and found partially correct, or correct-but-inert
 *   unknown    could not be checked; says why. Never means "probably fine".
 * ========================================================================== */
"use strict";

const store = require("./store");

const STATE = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  VERIFIED: "verified",
  DEGRADED: "degraded",
  UNKNOWN: "unknown",
};

// The evidence tables supabase/evidence_append_only.sql protects. Listed here
// so a table added to that migration without being added here shows up as a
// gap rather than passing unnoticed.
const APPEND_ONLY_TABLES = ["rg_decisions", "rg_integration_events", "rg_ops_evidence"];

// How many recent connector evidence records the hash sample reads. Small on
// purpose: this panel is a status light, not the audit. The report is the audit.
const HASH_SAMPLE_SIZE = 25;

const truthy = (v) => /^(1|true|yes)$/i.test(String(v == null ? "" : v));

const control = (id, label, state, summary, extra) => ({ id, label, state, summary, ...(extra || {}) });

/* ── 1. Operator fail-closed switches ────────────────────────────────────────
 * Read from the server environment only, and only ever as a boolean. The VALUE
 * is never returned — not because "1" is sensitive, but because a status
 * surface that echoes environment variables is one refactor away from echoing
 * one that is.
 */
function requireRecord() {
  const on = truthy(process.env.RUNTIME_REQUIRE_RECORD);
  return control("require_record", "Fail closed on unrecordable evidence",
    on ? STATE.ACTIVE : STATE.INACTIVE,
    on
      ? "A decision whose evidence cannot be recorded is BLOCKED rather than allowed to proceed."
      : "Not set. A decision whose evidence cannot be recorded proceeds, returning recorded:false with the error. The refusal is logged and alerted, not silent — but it is not fail-closed.",
    { env_var: "RUNTIME_REQUIRE_RECORD", configured_outside_the_app: true });
}

function requireDurable(backend, durable) {
  const on = truthy(process.env.RUNTIME_REQUIRE_DURABLE);
  // Set-but-running-on-a-non-durable-store is the one combination worth calling
  // out: the switch is on, so govern() refuses live traffic. Reporting that as
  // a plain "active" would hide why the platform is refusing to serve.
  if (on && !durable) {
    return control("require_durable", "Fail closed on a non-durable store", STATE.DEGRADED,
      `Set, but the active store is '${backend}' and reports itself non-durable, so governed traffic is being refused. Configure Supabase or clear the switch.`,
      { env_var: "RUNTIME_REQUIRE_DURABLE", configured_outside_the_app: true });
  }
  return control("require_durable", "Fail closed on a non-durable store",
    on ? STATE.ACTIVE : STATE.INACTIVE,
    on
      ? `Set, and the active store ('${backend}') is durable. Live traffic on a non-durable store would be refused.`
      : `Not set. Governed traffic would be served even if the store were non-durable (currently '${backend}', durable=${durable}).`,
    { env_var: "RUNTIME_REQUIRE_DURABLE", configured_outside_the_app: true });
}

/* ── 2. Append-only enforcement, read from database metadata ─────────────────
 * scripts/ops/schema-check.cjs probes tables and columns over PostgREST and
 * CANNOT see triggers, so a project passes it with the append-only guard
 * entirely absent. This reads pg_catalog through the read-only RPC in
 * supabase/assurance_status.sql, so the panel reports what the database has
 * rather than what the repository says it should have.
 */
async function appendOnly() {
  const res = await store.rpcOptional("rg_assurance_append_only");

  if (!res.ok) {
    const why = {
      no_cloud_backend: `The active store is the file backend, which has no triggers. Append-only enforcement is a database control and does not apply here.`,
      function_missing: "The introspection function is not deployed. Apply supabase/assurance_status.sql. Until then the trigger state cannot be read, and is NOT assumed to be present.",
      rpc_error: "The database rejected the introspection call.",
      rpc_threw: "The introspection call failed.",
    }[res.reason] || "Could not read trigger metadata.";
    return control("append_only", "Append-only evidence enforcement", STATE.UNKNOWN,
      why, { reason: res.reason, detail: res.detail || null, tables: null });
  }

  const rows = Array.isArray(res.data) ? res.data : [];
  const byTable = {};
  for (const t of APPEND_ONLY_TABLES) {
    // A table may legitimately carry several triggers. It is protected when at
    // least one is enabled AND genuinely fires BEFORE UPDATE — a disabled
    // trigger, or one that fires AFTER, blocks nothing.
    const found = rows.filter((r) => r.table_name === t);
    const guard = found.find((r) => r.enabled && r.before_update) || null;
    const inert = found.find((r) => !r.enabled || !r.before_update) || null;
    byTable[t] = {
      protected: !!guard,
      trigger: guard ? guard.trigger_name : (inert ? inert.trigger_name : null),
      note: guard ? null
        : inert ? (!inert.enabled ? "present but DISABLED" : "present but does not fire BEFORE UPDATE")
          : "no append-only trigger found",
    };
  }

  const protectedCount = APPEND_ONLY_TABLES.filter((t) => byTable[t].protected).length;
  if (protectedCount === APPEND_ONLY_TABLES.length) {
    return control("append_only", "Append-only evidence enforcement", STATE.VERIFIED,
      `All ${protectedCount} evidence tables reject UPDATE at the database, for every role including the service role the application itself uses. Deletion is deliberately still permitted — customer erasure depends on it.`,
      { tables: byTable });
  }
  if (protectedCount === 0) {
    return control("append_only", "Append-only evidence enforcement", STATE.INACTIVE,
      "No append-only trigger is installed on any evidence table. Evidence in this project can be altered in place. Apply supabase/evidence_append_only.sql.",
      { tables: byTable });
  }
  return control("append_only", "Append-only evidence enforcement", STATE.DEGRADED,
    `${protectedCount} of ${APPEND_ONLY_TABLES.length} evidence tables are protected. The remainder can be altered in place.`,
    { tables: byTable });
}

/* ── 3. Evidence-hash verification ───────────────────────────────────────────
 * Two separate questions, and conflating them would be the easy mistake:
 *   (a) CAPABILITY — does this project carry evidence_hash_alg, so verification
 *       is possible at all?
 *   (b) SAMPLE — of the most recent records, how many actually verify?
 * A project can have the column and still hold older records that predate it;
 * those are `unverifiable`, which is not a failure and must never be rendered
 * as one.
 */
async function evidenceHash() {
  let rows;
  try {
    rows = await store.findOptional("integration_events", {});
  } catch (e) {
    return control("evidence_hash", "Evidence hash verification", STATE.UNKNOWN,
      "Could not read connector evidence, so hash verification state is unknown.",
      { detail: (e && e.message) || String(e) });
  }

  if (!rows.length) {
    return control("evidence_hash", "Evidence hash verification", STATE.UNKNOWN,
      "No connector evidence recorded yet, so there is nothing to verify. This is not a failure — it is an absence of evidence.",
      { sampled: 0 });
  }

  const gateway = require("./integration-gateway");
  const sample = rows
    .slice()
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .slice(0, HASH_SAMPLE_SIZE);

  const counts = { verified: 0, unverifiable: 0, mismatch: 0, absent: 0 };
  for (const row of sample) {
    let state;
    try {
      if (!row.evidence_hash) state = "absent";
      else if (row.evidence_hash_alg !== gateway.EVIDENCE_HASH_ALG) state = "unverifiable";
      else state = gateway.canonicalEvidenceHash(row.evidence || {}) === row.evidence_hash ? "verified" : "mismatch";
    } catch { state = "unverifiable"; }
    counts[state] += 1;
  }

  const base = { sampled: sample.length, total_records: rows.length, counts, algorithm: gateway.EVIDENCE_HASH_ALG };

  if (counts.mismatch > 0) {
    return control("evidence_hash", "Evidence hash verification", STATE.DEGRADED,
      `${counts.mismatch} of the ${sample.length} most recent records failed hash verification. A mismatch means the stored payload no longer matches the hash recorded with it. Generate a report for the authoritative finding.`,
      base);
  }
  if (counts.absent > 0) {
    return control("evidence_hash", "Evidence hash verification", STATE.DEGRADED,
      `${counts.absent} of the ${sample.length} most recent records carry no hash at all, so their integrity cannot be established either way.`,
      base);
  }
  if (counts.verified === 0) {
    return control("evidence_hash", "Evidence hash verification", STATE.UNKNOWN,
      `None of the ${sample.length} most recent records can be verified — all predate canonical hashing. They are reported as unverifiable, never as tampered. Apply supabase/evidence_hash_canonical.sql if it is missing.`,
      base);
  }
  if (counts.unverifiable > 0) {
    return control("evidence_hash", "Evidence hash verification", STATE.DEGRADED,
      `${counts.verified} verified, ${counts.unverifiable} unverifiable (written before canonical hashing). Unverifiable is a fact about history, not a tamper finding.`,
      base);
  }
  return control("evidence_hash", "Evidence hash verification", STATE.VERIFIED,
    `All ${counts.verified} of the most recent records recompute to their stored hash.`,
    base);
}

/* ── 4. Latest report verification result ────────────────────────────────────
 * The report is where integrity verification actually happens. This surfaces
 * the most recent one's outcome so the panel points at the authoritative
 * artefact rather than trying to replace it.
 */
async function latestReport() {
  let rows;
  try {
    rows = await store.findOptional("reports", {});
  } catch (e) {
    return control("report_verification", "Latest report integrity result", STATE.UNKNOWN,
      "Could not read reports.", { detail: (e && e.message) || String(e) });
  }

  const withSection = rows
    .filter((r) => r && r.connector_activity)
    .sort((a, b) => String(b.generated_at || "").localeCompare(String(a.generated_at || "")));

  if (!withSection.length) {
    return control("report_verification", "Latest report integrity result", STATE.UNKNOWN,
      rows.length
        ? "No report carries a connector-activity section yet. Generate one, or apply supabase/connector_audit_projection.sql if the column is missing."
        : "No report has been generated yet.",
      { reports: rows.length });
  }

  const r = withSection[0];
  const ca = r.connector_activity || {};
  const meta = {
    report_id: r.id || null,
    period: r.period || null,
    generated_at: r.generated_at || null,
    window: r.window || null,
    findings: Array.isArray(ca.findings) ? ca.findings.length : 0,
    register_total: ca.register_total == null ? null : ca.register_total,
  };

  if (ca.available === false) {
    return control("report_verification", "Latest report integrity result", STATE.UNKNOWN,
      `The most recent report could not build its connector-activity section: ${ca.unavailable_reason || "reason not recorded"}.`, meta);
  }

  const findings = Array.isArray(ca.findings) ? ca.findings : [];
  const critical = findings.filter((f) => f && (f.severity === "critical" || f.severity === "high"));
  if (critical.length) {
    return control("report_verification", "Latest report integrity result", STATE.DEGRADED,
      `The most recent report recorded ${findings.length} integrity finding(s), ${critical.length} at high or critical severity.`,
      { ...meta, severities: findings.reduce((a, f) => { const k = (f && f.severity) || "unknown"; a[k] = (a[k] || 0) + 1; return a; }, {}) });
  }
  if (findings.length) {
    return control("report_verification", "Latest report integrity result", STATE.DEGRADED,
      `The most recent report recorded ${findings.length} integrity finding(s), none above medium severity.`, meta);
  }
  return control("report_verification", "Latest report integrity result", STATE.VERIFIED,
    "The most recent report recorded no integrity exceptions: every governed connector execution in its window was attributable to a canonical action, a proposal and a connector in scope.", meta);
}

/* ── Assembly ────────────────────────────────────────────────────────────── */

async function status() {
  const backend = store.backend();
  const durable = store.durable();

  // Settled independently so one failing check cannot take the panel down and
  // leave the others unread — the failure mode that would push an operator back
  // to assuming.
  const settled = await Promise.all([
    Promise.resolve(requireRecord()),
    Promise.resolve(requireDurable(backend, durable)),
    appendOnly().catch((e) => control("append_only", "Append-only evidence enforcement", STATE.UNKNOWN,
      "The append-only check itself failed.", { detail: (e && e.message) || String(e) })),
    evidenceHash().catch((e) => control("evidence_hash", "Evidence hash verification", STATE.UNKNOWN,
      "The evidence-hash check itself failed.", { detail: (e && e.message) || String(e) })),
    latestReport().catch((e) => control("report_verification", "Latest report integrity result", STATE.UNKNOWN,
      "The report check itself failed.", { detail: (e && e.message) || String(e) })),
  ]);

  const counts = settled.reduce((a, c) => { a[c.state] = (a[c.state] || 0) + 1; return a; }, {});

  return {
    generated_at: store.nowISO(),
    store: { backend, durable },
    controls: settled,
    counts,
    // Requirement from the audit: the Control Room must not let an operator read
    // the Integration Gateway event list as an integrity check. It renders the
    // STORED hash and runs no verification, so a tampered record looks identical
    // to a sound one there.
    notes: [
      "The Integration Gateway event list displays the stored evidence hash only. It performs no verification, so an altered record is indistinguishable from a sound one in that view.",
      "Integrity verification happens when a report is generated. Use a generated report, not the event list, as the authoritative integrity result.",
      "This panel is read-only. These controls are configured outside the application — environment variables in the deployment, and migrations applied to the database — and cannot be changed from the Control Room.",
    ],
  };
}

module.exports = { status, STATE, APPEND_ONLY_TABLES, HASH_SAMPLE_SIZE };
