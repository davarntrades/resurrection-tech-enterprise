/* ============================================================================
 * Runtime Governance — normalized connector audit projection.
 *
 * ONE read-only projection over the evidence that already exists. It copies
 * nothing, regenerates nothing and writes nothing: every row it returns is
 * derived from records the governed execution path already wrote.
 *
 *   rg_integration_events        the immutable evidence spine (one row per
 *                                governed connector outcome, with evidence_hash)
 *   rg_integration_connectors    connector name / type / provider metadata
 *   rg_ops_proposals             the proposal + approval lifecycle
 *   rg_bedrock_invocation_runs   model, hashes, latency, invocation count
 *   rg_communication_runs        the same, for communication connectors
 *
 * Why a projection and not a table: the evidence IS the record of truth. A
 * second copy could drift from it, and a drifted audit trail is worse than no
 * audit trail. Nothing here is authoritative — it only reads and normalizes.
 *
 * Connector neutrality is the point. Classification keys off the SHAPE of an
 * evidence type (`<domain>.<outcome>`), not off a connector allow-list, so a
 * future connector that emits well-formed GuardianOS evidence appears in the
 * monthly report the day it ships, with no change here. An unrecognised
 * connector type normalizes to `other` and KEEPS its original type — it is
 * never dropped, because silently vanishing evidence is the one failure mode an
 * audit projection must not have.
 * ============================================================================ */
"use strict";
const store = require("./store");

// ── Reporting categories ─────────────────────────────────────────────────────
// Maps a stored connector type to the category the report groups by. Types not
// listed here still report, under `other`, carrying their original type.
const CONNECTOR_CATEGORIES = Object.freeze({
  "aws-bedrock": { category: "aws-bedrock", provider: "amazon-bedrock", label: "Amazon Bedrock" },
  "google-vertex-ai": { category: "google-vertex-ai", provider: "google-vertex-ai", label: "Google Vertex AI" },
  "google_vertex_ai": { category: "google-vertex-ai", provider: "google-vertex-ai", label: "Google Vertex AI" },
  "google-gemini": { category: "google-vertex-ai", provider: "google-gemini", label: "Google Gemini" },
  "azure-openai": { category: "azure-openai", provider: "azure-openai", label: "Azure OpenAI" },
  "azure_openai": { category: "azure-openai", provider: "azure-openai", label: "Azure OpenAI" },
  "azure-ai-foundry": { category: "azure-ai-foundry", provider: "azure-ai-foundry", label: "Azure AI Foundry" },
  "azure_ai_foundry": { category: "azure-ai-foundry", provider: "azure-ai-foundry", label: "Azure AI Foundry" },
  gmail: { category: "customer-support", provider: "gmail", label: "Gmail" },
});

/** Normalize a connector type. Unknown types stay visible as `other`. */
function normalizeConnectorType(type) {
  const raw = type == null ? null : String(type);
  if (!raw) return { category: "other", provider: null, label: "Unknown connector", original_type: null, known: false };
  const hit = CONNECTOR_CATEGORIES[raw];
  if (hit) return { ...hit, original_type: raw, known: true };
  return { category: "other", provider: null, label: raw, original_type: raw, known: false };
}

// ── Evidence classification ──────────────────────────────────────────────────
// Keyed on the evidence-type SUFFIX so new connector domains classify for free.
// `outcome` is the normalized execution outcome; `provider_call` says whether
// the provider boundary was crossed (what "zero provider calls" is proved from).
const OUTCOME_BY_SUFFIX = Object.freeze({
  invocation: { outcome: "executed", provider_call: true, decision: "allow" },
  "message.sent": { outcome: "executed", provider_call: true, decision: "allow" },
  "mailbox.read": { outcome: "executed", provider_call: true, decision: "allow" },
  "workflow.execution": { outcome: "executed", provider_call: true, decision: "allow" },
  "governance.decision": { outcome: "refused", provider_call: false, decision: null },
  "governance.unavailable": { outcome: "failed_closed", provider_call: false, decision: "block" },
  "model.denied": { outcome: "refused", provider_call: false, decision: "block" },
  "action-group.decision": { outcome: "refused", provider_call: false, decision: null },
  failure: { outcome: "failed", provider_call: true, decision: "allow" },
  "message.failed": { outcome: "failed", provider_call: true, decision: "allow" },
  "mailbox.read.failed": { outcome: "failed", provider_call: true, decision: "allow" },
  "inbound.nonce": { outcome: "control", provider_call: false, decision: null },
});

/** Longest-suffix match, so `aws.bedrock.mailbox.read.failed` beats `…read`. */
function classify(type) {
  const raw = String(type || "");
  let best = null;
  for (const suffix of Object.keys(OUTCOME_BY_SUFFIX)) {
    if (raw === suffix || raw.endsWith(`.${suffix}`)) {
      if (!best || suffix.length > best.length) best = suffix;
    }
  }
  if (!best) return { outcome: "other", provider_call: false, decision: null, matched: null };
  return { ...OUTCOME_BY_SUFFIX[best], matched: best };
}

// ── Redaction ────────────────────────────────────────────────────────────────
// Allow-list, not deny-list: an evidence payload gains fields over time, and a
// deny-list would leak the next one added. Only these ever reach a report.
const EVIDENCE_FIELDS = Object.freeze([
  "connector_id", "proposal_id", "evidence_id", "governance_evidence_id",
  "request_hash", "response_hash", "message_hash", "model_id", "outcome",
  "mode", "streaming", "attempts", "code", "aws_request_id", "recipient_count",
  "operation", "channel", "provider", "action_id", "workflow", "status",
]);
function safeEvidence(evidence) {
  const out = {};
  if (!evidence || typeof evidence !== "object") return out;
  for (const key of EVIDENCE_FIELDS) if (evidence[key] !== undefined) out[key] = evidence[key];
  return out;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const iso = (v) => (v ? String(v) : null);
function within(value, since, until) {
  if (!value) return false;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return false;
  // Half-open [since, until): a record on a boundary belongs to exactly one
  // period, so consecutive monthly reports can never double-count it.
  if (since && t < Date.parse(since)) return false;
  if (until && t >= Date.parse(until)) return false;
  return true;
}

/** The timestamp a record is reported under. occurred_at is when it happened. */
function eventTime(row) { return iso(row.occurred_at) || iso(row.created_at); }

// ── Run-record enrichment ────────────────────────────────────────────────────
// Bedrock and communication runs carry the fields the evidence payload does not
// (model, latency, response hash, invocation count). They are indexed by
// proposal_id and by evidence_id so an evidence row can find its own run.
function indexRuns(rows, shape) {
  const byProposal = new Map();
  const byEvidence = new Map();
  for (const row of rows) {
    const rec = shape(row);
    if (rec.proposal_id && !byProposal.has(rec.proposal_id)) byProposal.set(rec.proposal_id, rec);
    if (rec.evidence_id && !byEvidence.has(rec.evidence_id)) byEvidence.set(rec.evidence_id, rec);
  }
  return { byProposal, byEvidence };
}

function bedrockRunShape(row) {
  return {
    source: "bedrock_invocation_run",
    run_id: row.id, proposal_id: row.proposal_id || null, evidence_id: row.evidence_id || null,
    connector_id: row.connector_id || null, connector_name: row.connector_name || null,
    model: row.model_id || null, actor: row.actor || null,
    governance_decision: row.governance_decision || null, approval_status: row.approval_status || null,
    execution_status: row.status || null, lifecycle_state: row.lifecycle_state || null,
    provider_invocation_count: num(row.provider_invocation_count),
    provider_called: row.aws_called === true,
    request_hash: row.prompt_hash || null, response_hash: row.response_hash || null,
    safe_failure_reason: row.safe_failure_reason || null,
    total_latency_ms: num(row.total_latency_ms), governance_latency_ms: num(row.governance_latency_ms),
    provider_latency_ms: num(row.provider_latency_ms),
    executed_at: iso(row.completed_at) || iso(row.execution_started_at) || iso(row.created_at),
    idempotency_key: row.idempotency_key || null,
  };
}

function communicationRunShape(row) {
  return {
    source: "communication_run",
    run_id: row.id, proposal_id: row.proposal_id || null, evidence_id: row.evidence_id || null,
    connector_id: row.connector_id || null, connector_name: row.connector_name || null,
    model: null, actor: row.actor || null,
    canonical_action_id: row.action_id || null, workflow: row.channel || null,
    governance_decision: row.governance_decision || null, approval_status: row.approval_status || null,
    execution_status: row.status || null, lifecycle_state: row.lifecycle_state || null,
    provider_invocation_count: num(row.provider_invocation_count),
    provider_called: row.provider_called === true,
    request_hash: row.canonical_action_hash || null, response_hash: row.message_hash || null,
    safe_failure_reason: row.safe_failure_reason || null,
    total_latency_ms: num(row.total_latency_ms), governance_latency_ms: num(row.governance_latency_ms),
    provider_latency_ms: num(row.provider_latency_ms),
    executed_at: iso(row.completed_at) || iso(row.created_at),
    idempotency_key: row.idempotency_key || null,
    provider: row.provider || null,
  };
}

/**
 * Build the normalized projection for ONE organisation, ONE environment and one
 * period. Every query is scoped by org_id; environment_id is applied to every
 * record before it can reach the output. Nothing is written.
 */
async function project({ org_id, environment_id = null, since = null, until = null } = {}) {
  if (!org_id) throw new Error("org_id is required");

  // findOptional degrades to [] on a table whose additive migration has not run
  // yet, so a deployment mid-migration reports what it has instead of failing.
  const [events, connectors, proposals, bedrockRuns, commRuns] = await Promise.all([
    store.findOptional("integration_events", { org_id }),
    store.findOptional("integration_connectors", { org_id }),
    store.findOptional("ops_proposals", { org_id }),
    store.findOptional("bedrock_invocation_runs", { org_id }),
    store.findOptional("communication_runs", { org_id }),
  ]);

  const inScope = (row) => row && row.org_id === org_id
    && (!environment_id || row.environment_id === environment_id);

  const connectorById = new Map();
  for (const c of connectors) if (inScope(c)) connectorById.set(c.id, c);
  const proposalById = new Map();
  for (const p of proposals) if (p && p.org_id === org_id) proposalById.set(p.id, p);

  const bedrock = indexRuns(bedrockRuns.filter(inScope), bedrockRunShape);
  const comms = indexRuns(commRuns.filter(inScope), communicationRunShape);

  const scoped = events
    .filter(inScope)
    .filter((e) => within(eventTime(e), since, until))
    .sort((a, b) => String(eventTime(a)).localeCompare(String(eventTime(b))));

  const rows = [];
  const findings = [];
  const seenIdempotency = new Map();

  for (const event of scoped) {
    const evidence = safeEvidence(event.evidence);
    const kind = classify(event.type);
    const proposal_id = evidence.proposal_id || null;
    const proposal = proposal_id ? proposalById.get(proposal_id) || null : null;
    const run = (proposal_id && (bedrock.byProposal.get(proposal_id) || comms.byProposal.get(proposal_id)))
      || bedrock.byEvidence.get(event.id) || comms.byEvidence.get(event.id) || null;

    const connector_id = evidence.connector_id || (run && run.connector_id) || null;
    const connector = connector_id ? connectorById.get(connector_id) || null : null;
    const normalized = normalizeConnectorType(connector ? connector.type : null);

    // The governance decision, in order of authority: the proposal's own status
    // (the lifecycle record), then the run's recorded decision, then what the
    // evidence type itself proves.
    const governance_decision = (proposal && proposal.status)
      || (run && run.governance_decision)
      || (evidence.outcome && String(evidence.outcome).toLowerCase())
      || kind.decision;

    const provider_invocation_count = run && run.provider_invocation_count != null
      ? run.provider_invocation_count
      : (kind.provider_call ? 1 : 0);

    const row = {
      evidence_id: event.id,
      evidence_hash: event.evidence_hash || null,
      evidence_created_at: iso(event.created_at),
      executed_at: eventTime(event),
      evidence_type: event.type,
      canonical_action_id: (run && run.canonical_action_id) || evidence.action_id
        || (proposal && proposal.action_id) || null,
      canonical_action_type: (proposal && proposal.action_id) || evidence.action_id || null,
      proposal_id,
      governance_decision: governance_decision || null,
      governance_reason: (proposal && proposal.decision && proposal.decision.reason) || null,
      governance_policy: (proposal && proposal.decision && proposal.decision.policy) || null,
      approval_status: (run && run.approval_status)
        || (proposal && proposal.operator && proposal.operator.status) || null,
      organisation_id: event.org_id,
      environment_id: event.environment_id,
      connector_id,
      connector_name: connector ? connector.name : (run && run.connector_name) || null,
      connector_type: normalized.original_type,
      normalized_connector: normalized.category,
      connector_known: normalized.known,
      provider: (run && run.provider) || evidence.provider || normalized.provider || null,
      model: evidence.model_id || (run && run.model) || null,
      workflow: (run && run.workflow) || evidence.workflow || evidence.channel || null,
      actor: event.actor || (run && run.actor) || null,
      execution_outcome: kind.outcome,
      execution_status: (run && run.execution_status) || evidence.status || null,
      provider_invocation_count,
      provider_called: run ? run.provider_called === true : kind.provider_call,
      failed_closed: kind.outcome === "failed_closed",
      failure_category: kind.outcome === "failed" ? (evidence.code || "provider_failure")
        : kind.outcome === "failed_closed" ? "governance_unavailable"
          : (run && run.safe_failure_reason) ? "safe_failure" : null,
      safe_failure_reason: (run && run.safe_failure_reason) || null,
      request_hash: evidence.request_hash || (run && run.request_hash) || null,
      response_hash: evidence.response_hash || (run && run.response_hash) || null,
      governance_latency_ms: run ? run.governance_latency_ms : null,
      provider_latency_ms: run ? run.provider_latency_ms : null,
      total_latency_ms: run ? run.total_latency_ms : null,
      run_id: run ? run.run_id : null,
      evidence_location: store.backend() === "file" ? "local_sovereign_store" : "customer_supabase",
    };
    rows.push(row);

    // ── Integrity findings ───────────────────────────────────────────────────
    if (kind.outcome !== "control") {
      if (!proposal_id) {
        findings.push({
          kind: "connector_invocation_without_canonical_action", severity: "high",
          evidence_id: event.id, connector_id,
          detail: `${event.type} carries no proposal reference, so it cannot be tied to a canonical action`,
        });
      } else if (!proposal) {
        findings.push({
          kind: "evidence_missing_attribution", severity: "high",
          evidence_id: event.id, proposal_id,
          detail: `proposal ${proposal_id} referenced by evidence was not found for this organisation`,
        });
      }
      if (kind.provider_call && proposal && proposal.status !== "executed") {
        findings.push({
          kind: "provider_call_without_permit", severity: "critical",
          evidence_id: event.id, proposal_id,
          detail: `provider was invoked while the proposal status is ${proposal.status}`,
        });
      }
      if (!connector_id) {
        findings.push({
          kind: "evidence_missing_attribution", severity: "medium",
          evidence_id: event.id,
          detail: `${event.type} records no connector, so it cannot be attributed to a connected system`,
        });
      } else if (!connector) {
        findings.push({
          kind: "cross_scope_mismatch", severity: "high",
          evidence_id: event.id, connector_id,
          detail: `connector ${connector_id} is not present in this organisation and environment`,
        });
      }
      if (row.failed_closed) {
        findings.push({
          kind: "failed_closed_execution", severity: "medium",
          evidence_id: event.id, connector_id,
          detail: `${event.type} refused execution because Runtime Governance was unavailable`,
        });
      }
      if (connector_id && !normalized.known) {
        findings.push({
          kind: "unknown_connector_type", severity: "low",
          evidence_id: event.id, connector_id,
          detail: `connector type ${normalized.original_type || "unset"} has no reporting category; reported as "other"`,
        });
      }
    }

    // Idempotent retries share an idempotency key and must not inflate totals.
    if (run && run.idempotency_key && kind.provider_call) {
      const key = `${run.source}:${run.idempotency_key}`;
      const prior = seenIdempotency.get(key);
      if (prior && prior !== run.run_id) {
        findings.push({
          kind: "duplicate_provider_invocation", severity: "high",
          evidence_id: event.id, detail: `two runs share idempotency key on ${run.source}`,
        });
      }
      seenIdempotency.set(key, run.run_id);
    }
  }

  return { rows, findings, connectorById };
}

/** Provider invocations counted once per run, so retries cannot inflate it. */
function providerInvocations(rows) {
  const counted = new Set();
  let total = 0;
  for (const r of rows) {
    if (!r.provider_called) continue;
    const key = r.run_id || r.evidence_id;
    if (counted.has(key)) continue;
    counted.add(key);
    total += r.provider_invocation_count != null ? r.provider_invocation_count : 1;
  }
  return total;
}

const stat = (values) => {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return { mean: null, p95: null, max: null };
  const mean = +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
  return { mean, p95: xs[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))], max: xs[xs.length - 1] };
};

const DECISION_ALLOW = new Set(["executed", "allow", "allowed", "success", "permitted"]);
const DECISION_BLOCK = new Set(["blocked", "block", "refused", "rejected_by_policy"]);
const DECISION_ESCALATE = new Set(["escalated", "escalate", "awaiting_approval"]);

function decisionBucket(row) {
  const d = String(row.governance_decision || "").toLowerCase();
  if (DECISION_ESCALATE.has(d)) return "escalate";
  if (DECISION_BLOCK.has(d)) return "block";
  if (DECISION_ALLOW.has(d)) return "allow";
  if (row.execution_outcome === "executed" || row.execution_outcome === "failed") return "allow";
  if (row.execution_outcome === "failed_closed") return "block";
  return "other";
}

/**
 * The reportable summary for one org/environment/period. Shape is stable, so a
 * period with no connector activity renders the same sections with zeros rather
 * than disappearing from the report.
 */
async function summary({ org_id, environment_id = null, since = null, until = null } = {}) {
  const { rows, findings, connectorById } = await project({ org_id, environment_id, since, until });

  const buckets = { allow: 0, block: 0, escalate: 0, other: 0 };
  const byConnector = new Map();
  let approved = 0; let rejected = 0; let failedClosed = 0; let executed = 0; let failed = 0;

  for (const row of rows) {
    const bucket = decisionBucket(row);
    buckets[bucket] += 1;
    const approval = String(row.approval_status || "").toLowerCase();
    if (approval.includes("approved")) approved += 1;
    if (approval.includes("rejected") || approval.includes("denied")) rejected += 1;
    if (row.failed_closed) failedClosed += 1;
    if (row.execution_outcome === "executed") executed += 1;
    if (row.execution_outcome === "failed") failed += 1;

    const key = row.connector_id || `unattributed:${row.normalized_connector}`;
    if (!byConnector.has(key)) {
      const meta = row.connector_id ? connectorById.get(row.connector_id) : null;
      byConnector.set(key, {
        connector_id: row.connector_id, connector_name: row.connector_name || (meta && meta.name) || null,
        connector_type: row.connector_type, normalized_connector: row.normalized_connector,
        provider: row.provider, environment_id: row.environment_id,
        governed_requests: 0, allow: 0, block: 0, escalate: 0, other: 0,
        approvals: 0, rejections: 0, provider_calls: 0, blocked_provider_calls: 0,
        failed_closed: 0, evidence_count: 0, models: new Set(),
        _governance: [], _provider: [], _total: [],
      });
    }
    const c = byConnector.get(key);
    c.governed_requests += 1;
    c[bucket] += 1;
    c.evidence_count += 1;
    if (approval.includes("approved")) c.approvals += 1;
    if (approval.includes("rejected") || approval.includes("denied")) c.rejections += 1;
    if (row.provider_called) c.provider_calls += 1; else if (bucket !== "allow") c.blocked_provider_calls += 1;
    if (row.failed_closed) c.failed_closed += 1;
    if (row.model) c.models.add(row.model);
    if (row.governance_latency_ms != null) c._governance.push(row.governance_latency_ms);
    if (row.provider_latency_ms != null) c._provider.push(row.provider_latency_ms);
    if (row.total_latency_ms != null) c._total.push(row.total_latency_ms);
  }

  const connectors = [...byConnector.values()].map((c) => {
    const { _governance, _provider, _total, models, ...rest } = c;
    return {
      ...rest, models: [...models].sort(),
      latency: { governance_ms: stat(_governance), provider_ms: stat(_provider), total_ms: stat(_total) },
    };
  }).sort((a, b) => b.governed_requests - a.governed_requests
    || String(a.connector_id).localeCompare(String(b.connector_id)));

  const attributed = rows.filter((r) => r.proposal_id && r.connector_id).length;
  const models = [...new Set(rows.map((r) => r.model).filter(Boolean))].sort();
  const providers = [...new Set(rows.map((r) => r.provider).filter(Boolean))].sort();

  return {
    window: { since, until },
    scope: { org_id, environment_id },
    totals: {
      governed_actions: rows.length,
      permitted: buckets.allow, blocked: buckets.block, escalated: buckets.escalate, unclassified: buckets.other,
      approved, rejected, failed_closed: failedClosed,
      successful_executions: executed, failed_executions: failed,
      provider_invocations: providerInvocations(rows),
      evidence_completeness_pct: rows.length ? +((attributed / rows.length) * 100).toFixed(1) : 100,
      connector_coverage: connectors.length,
      model_coverage: models.length,
    },
    connectors,
    models, providers,
    register: rows,
    findings,
  };
}

module.exports = {
  CONNECTOR_CATEGORIES, OUTCOME_BY_SUFFIX,
  normalizeConnectorType, classify, safeEvidence, decisionBucket, providerInvocations,
  project, summary,
};
