#!/usr/bin/env node
/* ============================================================================
 * Runtime Governance — normalized connector audit projection.
 *
 * Proves that governed connector activity reaches audit aggregation, the
 * monthly evidence pack and audit.pdf through ONE projection over the evidence
 * the governed path already wrote. Fixtures only: the provider boundary is
 * never crossed, so this costs nothing to run in CI.
 * ============================================================================ */
"use strict";
const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-conn-audit-"));

const store = require("../../lib/runtime/store");
const audit = require("../../lib/runtime/connector-audit");
const reports = require("../../lib/runtime/reports");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };

const ORG = "org_alpha";
const OTHER_ORG = "org_beta";
const ENV = "env_prod";
const OTHER_ENV = "env_stage";
const SINCE = "2026-06-01T00:00:00.000Z";
const UNTIL = "2026-07-01T00:00:00.000Z";

const connector = (id, org, env, type, name) => store.insert("integration_connectors", {
  id, org_id: org, environment_id: env, type, name, status: "configured", health: "healthy",
});
const proposal = (id, org, env, action_id, status, extra = {}) => store.insert("ops_proposals", {
  id, org_id: org, environment_id: env, action_id, status, ...extra,
});
const event = (id, org, env, type, evidence, at) => store.insert("integration_events", {
  id, org_id: org, environment_id: env, type, actor: "customer",
  evidence, evidence_hash: store.sha256(JSON.stringify(evidence)),
  immutable: true, occurred_at: at, created_at: at,
});

(async () => {
  // ── Fixtures ───────────────────────────────────────────────────────────────
  await connector("int_bedrock", ORG, ENV, "aws-bedrock", "Production Bedrock");
  await connector("int_gmail", ORG, ENV, "gmail", "Support Mailbox");
  await connector("int_vertex", ORG, ENV, "google-vertex-ai", "Vertex Reasoning");
  await connector("int_azure", ORG, ENV, "azure-openai", "Azure GPT");
  await connector("int_future", ORG, ENV, "acme-neural", "Future Connector");
  await connector("int_stage", ORG, OTHER_ENV, "aws-bedrock", "Staging Bedrock");
  await connector("int_beta", OTHER_ORG, ENV, "aws-bedrock", "Beta Bedrock");

  // 1 — permitted Bedrock invocation, fully attributed.
  await proposal("ops_ok", ORG, ENV, "invoke_aws_bedrock_model", "executed", {
    decision: { reason: "permitted", policy: "ops_model_invocation" },
    execution: { executed: true },
  });
  await store.insert("bedrock_invocation_runs", {
    id: "bir_ok", org_id: ORG, environment_id: ENV, connector_id: "int_bedrock",
    connector_name: "Production Bedrock", model_id: "openai.gpt-oss-20b-1:0",
    proposal_id: "ops_ok", evidence_id: "ev_ok", governance_decision: "executed",
    approval_status: "not_required_or_approved", status: "completed", lifecycle_state: "complete",
    provider_invocation_count: 1, aws_called: true,
    prompt_hash: "a".repeat(64), response_hash: "b".repeat(64),
    total_latency_ms: 2418, governance_latency_ms: 866, provider_latency_ms: 646,
    idempotency_key: "idem-ok", actor: "customer", completed_at: "2026-06-15T10:00:02.000Z",
    // Confidential content the report must never surface.
    prompt_content: "CONFIDENTIAL CUSTOMER PROMPT", response_content: { text: "CONFIDENTIAL MODEL REPLY" },
  });
  await event("ev_ok", ORG, ENV, "aws.bedrock.invocation", {
    connector_id: "int_bedrock", proposal_id: "ops_ok", request_hash: "a".repeat(64),
    aws_request_id: "aws-1", mode: "converse", attempts: 1, outcome: "success",
  }, "2026-06-15T10:00:02.000Z");

  // 2 — blocked Bedrock request: zero provider calls.
  await proposal("ops_block", ORG, ENV, "invoke_aws_bedrock_model", "blocked", {
    decision: { reason: "omega finance boundary", policy: "OPS_FINANCE" },
  });
  await event("ev_block", ORG, ENV, "aws.bedrock.governance.decision", {
    connector_id: "int_bedrock", proposal_id: "ops_block", request_hash: "c".repeat(64), outcome: "blocked",
  }, "2026-06-16T09:00:00.000Z");

  // 3 — escalated then approved: exactly one provider call.
  await proposal("ops_esc", ORG, ENV, "invoke_aws_bedrock_model", "executed", {
    decision: { reason: "escalated then approved", policy: "OPS_REPORT_DELIVERY" },
    execution: { executed: true }, operator: { status: "approved" },
  });
  await store.insert("bedrock_invocation_runs", {
    id: "bir_esc", org_id: ORG, environment_id: ENV, connector_id: "int_bedrock",
    model_id: "openai.gpt-oss-20b-1:0", proposal_id: "ops_esc", evidence_id: "ev_esc",
    governance_decision: "executed", approval_status: "approved_and_executed",
    status: "completed", lifecycle_state: "complete",
    provider_invocation_count: 1, aws_called: true, prompt_hash: "d".repeat(64),
    idempotency_key: "idem-esc", completed_at: "2026-06-17T09:00:00.000Z",
  });
  await event("ev_esc", ORG, ENV, "aws.bedrock.invocation", {
    connector_id: "int_bedrock", proposal_id: "ops_esc", request_hash: "d".repeat(64), outcome: "success",
  }, "2026-06-17T09:00:00.000Z");

  // 4 — denied approval: zero provider calls.
  await proposal("ops_denied", ORG, ENV, "invoke_aws_bedrock_model", "rejected", {
    decision: { reason: "operator rejected" }, operator: { status: "rejected" },
  });
  await store.insert("bedrock_invocation_runs", {
    id: "bir_denied", org_id: ORG, environment_id: ENV, connector_id: "int_bedrock",
    model_id: "openai.gpt-oss-20b-1:0", proposal_id: "ops_denied", evidence_id: "ev_denied",
    governance_decision: "rejected", approval_status: "rejected", status: "rejected",
    lifecycle_state: "rejected", provider_invocation_count: 0, aws_called: false,
    prompt_hash: "e".repeat(64), idempotency_key: "idem-denied",
  });
  await event("ev_denied", ORG, ENV, "aws.bedrock.governance.decision", {
    connector_id: "int_bedrock", proposal_id: "ops_denied", request_hash: "e".repeat(64), outcome: "rejected",
  }, "2026-06-18T09:00:00.000Z");

  // 5 — failed-closed execution (engine unreachable).
  await event("ev_failclosed", ORG, ENV, "aws.bedrock.governance.unavailable", {
    connector_id: "int_bedrock", request_hash: "f".repeat(64), proposal_id: "ops_ok", outcome: "BLOCK",
  }, "2026-06-19T09:00:00.000Z");

  // 6 — Vertex AI and Azure OpenAI normalize through the same path.
  await proposal("ops_vertex", ORG, ENV, "invoke_vertex_model", "executed", { execution: { executed: true } });
  await event("ev_vertex", ORG, ENV, "google.vertex.invocation", {
    connector_id: "int_vertex", proposal_id: "ops_vertex", model_id: "gemini-2.0-pro", outcome: "success",
  }, "2026-06-20T09:00:00.000Z");
  await proposal("ops_azure", ORG, ENV, "invoke_azure_openai", "executed", { execution: { executed: true } });
  await event("ev_azure", ORG, ENV, "azure.openai.invocation", {
    connector_id: "int_azure", proposal_id: "ops_azure", model_id: "gpt-4o-deployment", outcome: "success",
  }, "2026-06-20T10:00:00.000Z");

  // 7 — Customer Support Assistant through the communication run projection.
  await proposal("ops_cs", ORG, ENV, "customer_support_assistant.respond", "executed", { execution: { executed: true } });
  await store.insert("communication_runs", {
    id: "cmr_cs", org_id: ORG, environment_id: ENV, channel: "email", provider: "gmail",
    adapter: "gmail", action_id: "customer_support_assistant.respond", operation: "send",
    connector_id: "int_gmail", connector_name: "Support Mailbox",
    canonical_action_hash: "1".repeat(64), message_hash: "2".repeat(64),
    proposal_id: "ops_cs", evidence_id: "ev_cs", governance_decision: "executed",
    approval_status: "approved_and_executed", status: "completed", lifecycle_state: "complete",
    provider_invocation_count: 1, provider_called: true, delivered: true,
    total_latency_ms: 1789, governance_latency_ms: 864, provider_latency_ms: 536,
    idempotency_key: "idem-cs", subject: "CONFIDENTIAL SUBJECT LINE",
    completed_at: "2026-06-21T09:00:00.000Z",
  });
  await event("ev_cs", ORG, ENV, "communication.message.sent", {
    connector_id: "int_gmail", proposal_id: "ops_cs", message_hash: "2".repeat(64), outcome: "sent",
  }, "2026-06-21T09:00:00.000Z");

  // 8 — an unknown future connector type must stay visible.
  await proposal("ops_future", ORG, ENV, "acme.invoke", "executed", { execution: { executed: true } });
  await event("ev_future", ORG, ENV, "acme.neural.invocation", {
    connector_id: "int_future", proposal_id: "ops_future", model_id: "acme-1", outcome: "success",
  }, "2026-06-22T09:00:00.000Z");

  // 9 — isolation probes: other org, other environment, outside the window.
  await event("ev_beta", OTHER_ORG, ENV, "aws.bedrock.invocation", { connector_id: "int_beta", proposal_id: "ops_beta" }, "2026-06-23T09:00:00.000Z");
  await event("ev_stage", ORG, OTHER_ENV, "aws.bedrock.invocation", { connector_id: "int_stage", proposal_id: "ops_stage" }, "2026-06-23T09:00:00.000Z");
  await event("ev_before", ORG, ENV, "aws.bedrock.invocation", { connector_id: "int_bedrock", proposal_id: "ops_ok" }, "2026-05-31T23:59:59.999Z");
  await event("ev_boundary_start", ORG, ENV, "aws.bedrock.invocation", { connector_id: "int_bedrock", proposal_id: "ops_ok" }, SINCE);
  await event("ev_boundary_end", ORG, ENV, "aws.bedrock.invocation", { connector_id: "int_bedrock", proposal_id: "ops_ok" }, UNTIL);

  // ── Projection ─────────────────────────────────────────────────────────────
  const s = await audit.summary({ org_id: ORG, environment_id: ENV, since: SINCE, until: UNTIL });
  const byId = new Map(s.register.map((r) => [r.evidence_id, r]));

  // 1. A governed Bedrock invocation lands in the right period.
  ok(byId.has("ev_ok"), "1. governed Bedrock invocation appears in the reporting period");

  // 2. Every traceable field survives the projection.
  const okRow = byId.get("ev_ok") || {};
  ok(okRow.canonical_action_id === "invoke_aws_bedrock_model"
    && okRow.proposal_id === "ops_ok"
    && okRow.governance_decision === "executed"
    && okRow.connector_id === "int_bedrock"
    && okRow.normalized_connector === "aws-bedrock"
    && okRow.provider === "amazon-bedrock"
    && okRow.model === "openai.gpt-oss-20b-1:0"
    && okRow.request_hash === "a".repeat(64)
    && okRow.response_hash === "b".repeat(64)
    && okRow.provider_invocation_count === 1
    && okRow.governance_latency_ms === 866
    && okRow.provider_latency_ms === 646
    && okRow.total_latency_ms === 2418
    && !!okRow.evidence_created_at && !!okRow.executed_at,
  `2. traceable attribution preserved (got ${JSON.stringify({ a: okRow.canonical_action_id, m: okRow.model, rh: !!okRow.request_hash, sh: !!okRow.response_hash, c: okRow.provider_invocation_count })})`);

  // 3. A blocked request appears, with zero provider calls.
  const blocked = byId.get("ev_block") || {};
  ok(blocked.governance_decision === "blocked" && blocked.provider_invocation_count === 0 && blocked.provider_called === false,
    `3. blocked Bedrock request reported with zero provider calls (got ${blocked.governance_decision}/${blocked.provider_invocation_count})`);

  // 4. Escalated → approved executes exactly once.
  const esc = byId.get("ev_esc") || {};
  ok(esc.approval_status === "approved_and_executed" && esc.provider_invocation_count === 1,
    `4. escalated-then-approved records exactly one provider call (got ${esc.provider_invocation_count})`);

  // 5. A denied approval executes zero times.
  const denied = byId.get("ev_denied") || {};
  ok(denied.provider_invocation_count === 0 && denied.provider_called === false
    && String(denied.approval_status).includes("rejected"),
  `5. denied approval records zero provider calls (got ${denied.provider_invocation_count}/${denied.approval_status})`);

  // 6. A failed-closed execution is an exception, not a silent drop.
  const fc = byId.get("ev_failclosed") || {};
  ok(fc.failed_closed === true && fc.failure_category === "governance_unavailable"
    && s.findings.some((f) => f.kind === "failed_closed_execution" && f.evidence_id === "ev_failclosed"),
  "6. failed-closed connector execution is reported as an exception");

  // 7. Vertex AI and Azure normalize through the same projection.
  const vertex = byId.get("ev_vertex") || {};
  const azure = byId.get("ev_azure") || {};
  ok(vertex.normalized_connector === "google-vertex-ai" && vertex.model === "gemini-2.0-pro"
    && azure.normalized_connector === "azure-openai" && azure.model === "gpt-4o-deployment",
  `7. Vertex AI and Azure normalize through the same path (got ${vertex.normalized_connector}/${azure.normalized_connector})`);

  // 8. Customer Support evidence uses the same canonical projection.
  const cs = byId.get("ev_cs") || {};
  ok(cs.canonical_action_id === "customer_support_assistant.respond"
    && cs.normalized_connector === "customer-support" && cs.provider_invocation_count === 1
    && cs.governance_latency_ms === 864,
  `8. Customer Support Assistant evidence projects identically (got ${cs.canonical_action_id}/${cs.normalized_connector})`);

  // 9. An unknown connector type stays visible as `other`, keeping its type.
  const future = byId.get("ev_future") || {};
  ok(future.normalized_connector === "other" && future.connector_type === "acme-neural"
    && future.connector_known === false
    && s.findings.some((f) => f.kind === "unknown_connector_type"),
  "9. unknown future connector type remains visible as `other` and keeps its original type");

  // 10 & 11. Organisation and environment isolation.
  ok(!byId.has("ev_beta") && s.register.every((r) => r.organisation_id === ORG),
    "10. cross-organisation evidence cannot leak into the report");
  ok(!byId.has("ev_stage") && s.register.every((r) => r.environment_id === ENV),
    "11. cross-environment evidence cannot leak into the report");

  // 12. Deterministic half-open [since, until) boundaries.
  ok(!byId.has("ev_before") && byId.has("ev_boundary_start") && !byId.has("ev_boundary_end"),
    "12. period boundaries are half-open and deterministic — start included, end excluded");

  // 13. Idempotent retries do not inflate provider invocation totals.
  //     A retry re-emits evidence for the SAME run, so the register legitimately
  //     grows by a row while the provider-invocation total must not move. The
  //     naive sum (one per executed row) would report one more; dedup by run
  //     keeps it honest. Asserted against the naive count so this cannot pass
  //     vacuously if the dedup is removed.
  await event("ev_ok_dup", ORG, ENV, "aws.bedrock.invocation", {
    connector_id: "int_bedrock", proposal_id: "ops_ok", request_hash: "a".repeat(64), outcome: "success",
  }, "2026-06-15T10:00:03.000Z");
  const retried = await audit.summary({ org_id: ORG, environment_id: ENV, since: SINCE, until: UNTIL });
  const naive = retried.register.filter((r) => r.provider_called)
    .reduce((n, r) => n + (r.provider_invocation_count || 0), 0);
  ok(retried.register.length === s.register.length + 1, "13a. the retry's evidence row is still visible in the register");
  ok(naive > retried.totals.provider_invocations,
    `13b. the naive per-row sum would over-count (naive ${naive} vs reported ${retried.totals.provider_invocations})`);
  ok(retried.totals.provider_invocations === s.totals.provider_invocations,
    `13c. an idempotent retry does not inflate provider invocations (${s.totals.provider_invocations} → ${retried.totals.provider_invocations})`);

  // 14. Missing optional metadata must not break rendering.
  await event("ev_sparse", ORG, ENV, "aws.bedrock.invocation", {}, "2026-06-24T09:00:00.000Z");
  const sparse = await audit.summary({ org_id: ORG, environment_id: ENV, since: SINCE, until: UNTIL });
  const sparseRow = sparse.register.find((r) => r.evidence_id === "ev_sparse");
  ok(sparseRow && sparseRow.model === null && sparseRow.connector_id === null
    && sparse.findings.some((f) => f.kind === "connector_invocation_without_canonical_action"),
  "14a. evidence with no metadata still reports, and raises an attribution finding");

  const report = {
    id: "rep_x", org_id: ORG, environment_id: ENV, period: "monthly",
    window: { since: SINCE, until: UNTIL }, generated_at: UNTIL,
    headline: "h", trajectories: 0, totals: { ALLOW: 0, ESCALATE: 0, BLOCK: 0 },
    engine_verdicts: {}, would_block: 0, enforced: 0, human_review: 0,
    latency: { engine_compute_ms: {} }, top_rules: [], top_omega: [],
    connector_activity: { ...sparse, register_total: sparse.register.length, register_truncated: false, available: true },
  };
  const html = reports.toHtml(report);
  const md = reports.toMarkdown(report);
  ok(html.startsWith("<!doctype html>") && html.includes("Governed connector activity") && html.includes("ev_ok"),
    "14b. monthly HTML renders the connector section with sparse rows present");
  ok(md.includes("## Governed connector activity") && md.includes("ops_ok"),
    "14c. monthly Markdown renders the connector section");

  // 15. Redaction — no confidential content may reach any rendered artefact.
  const serialized = JSON.stringify(sparse) + html + md;
  const leaks = ["CONFIDENTIAL CUSTOMER PROMPT", "CONFIDENTIAL MODEL REPLY", "CONFIDENTIAL SUBJECT LINE"]
    .filter((needle) => serialized.includes(needle));
  ok(leaks.length === 0, `15. no confidential prompt, response or subject content reaches the report (leaked: ${leaks.join(", ") || "none"})`);

  // 16. A report without the section renders exactly as before (historical).
  const legacy = { ...report };
  delete legacy.connector_activity;
  const legacyHtml = reports.toHtml(legacy);
  const legacyMd = reports.toMarkdown(legacy);
  ok(!legacyHtml.includes("Governed connector activity") && legacyHtml.startsWith("<!doctype html>"),
    "16a. a pre-existing report without connector_activity renders unchanged (HTML)");
  ok(!legacyMd.includes("Governed connector activity") && legacyMd.includes("Governance Evidence"),
    "16b. a pre-existing report without connector_activity renders unchanged (Markdown)");

  // 17. A projection fault degrades to a stated gap, never a lost report.
  const degraded = await reports.connectorActivityFor({ org_id: "", environment_id: ENV, window: { since: SINCE, until: UNTIL } });
  ok(degraded.available === false && !!degraded.unavailable_reason,
    "17a. a projection fault is reported as an explicit gap, not silently dropped");
  const degradedHtml = reports.toHtml({ ...report, connector_activity: degraded });
  ok(degradedHtml.includes("could not be projected") && !degradedHtml.includes("undefined"),
    "17b. the monthly document still renders when the projection is unavailable");

  // Totals arithmetic, and the summary the executive section reports.
  ok(sparse.totals.governed_actions === sparse.register.length,
    "18. executive totals match the evidence register length");
  ok(sparse.totals.connector_coverage === sparse.connectors.length && sparse.totals.model_coverage === sparse.models.length,
    "19. connector and model coverage counts match the projected detail");
  ok(sparse.connectors.some((c) => c.connector_id === "int_bedrock" && c.provider_calls >= 2),
    "20. per-connector activity aggregates provider calls for that connector");

  // audit.pdf: the delivery kit must accept the same projection shape.
  const kit = require("../delivery-kit.cjs");
  if (kit && typeof kit.connectorEvidenceHtml === "function") {
    const section = kit.connectorEvidenceHtml({ ...sparse, register_total: sparse.register.length, available: true });
    ok(section.includes("Governed connector evidence") && section.includes("ev_ok"),
      "21. audit.pdf renders the governed connector evidence section");
    ok(kit.connectorEvidenceHtml(null) === "", "22. audit.pdf omits the section entirely when no connector evidence is supplied");
  } else {
    ok(false, "21. delivery-kit exports connectorEvidenceHtml for audit.pdf composition");
  }

  // 23. A deployment ahead of its migration must still persist the month's
  //     evidence — without the section — rather than losing the report.
  const realInsert = store.insert;
  let attempts = 0; let persistedKeys = null;
  store.insert = async (collection, row) => {
    if (collection !== "reports") return realInsert(collection, row);
    attempts += 1;
    if (attempts === 1) throw new Error("Could not find the 'connector_activity' column of 'rg_reports' in the schema cache");
    persistedKeys = Object.keys(row);
    return { ...row, id: "rep_fallback" };
  };
  const persisted = await reports.generate({ org_id: ORG, environment_id: ENV, period: "monthly", ref: UNTIL, persist: true });
  store.insert = realInsert;
  ok(attempts === 2 && persistedKeys && !persistedKeys.includes("connector_activity"),
    `23a. a missing connector_activity column falls back to persisting without it (attempts ${attempts})`);
  ok(persisted.connector_activity_persisted === false && !!persisted.connector_activity
    && persisted.connector_activity.register.some((r) => r.evidence_id === "ev_ok"),
  "23b. the fallback still returns the populated section for rendering, and flags that it was not stored");

  // 24. With the migration applied, persistence must store the section for real
  //     — the fallback above must NOT be the path a migrated deployment takes.
  let migratedAttempts = 0; let storedRow = null;
  store.insert = async (collection, row) => {
    if (collection !== "reports") return realInsert(collection, row);
    migratedAttempts += 1; storedRow = row;
    return { ...row, id: "rep_migrated" };
  };
  const stored = await reports.generate({ org_id: ORG, environment_id: ENV, period: "monthly", ref: UNTIL, persist: true });
  store.insert = realInsert;
  ok(migratedAttempts === 1, `24a. a migrated deployment persists in one attempt, with no fallback (attempts ${migratedAttempts})`);
  ok(storedRow && Object.prototype.hasOwnProperty.call(storedRow, "connector_activity")
    && storedRow.connector_activity && storedRow.connector_activity.available === true,
  "24b. the stored row contains the connector_activity section");
  ok(stored.connector_activity_persisted === undefined,
    `24c. no fallback flag is set when the column exists (got ${stored.connector_activity_persisted})`);
  ok(storedRow && Array.isArray(storedRow.connector_activity.register)
    && storedRow.connector_activity.register.some((r) => r.evidence_id === "ev_ok"),
  "24d. the persisted section carries the traceable evidence register");

  // 25. The rendered register must show the MOST RECENT rows. Showing the oldest
  //     rows of a truncated register buries the newest activity — the exact
  //     failure that made a production trace unable to find its own evidence.
  const many = { ...sparse };
  many.register = [];
  for (let i = 0; i < 60; i += 1) {
    many.register.push({
      evidence_id: `ev_bulk_${String(i).padStart(3, "0")}`,
      executed_at: `2026-06-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
      canonical_action_id: "bulk.action", proposal_id: `ops_bulk_${i}`,
      governance_decision: "executed", normalized_connector: "aws-bedrock",
      provider: "amazon-bedrock", model: "m", execution_outcome: "executed",
      provider_invocation_count: 1, request_hash: null, response_hash: null,
    });
  }
  const newest = many.register[many.register.length - 1].evidence_id;
  const oldest = many.register[0].evidence_id;
  const bulkReport = { ...report, connector_activity: { ...many, register_total: many.register.length, register_truncated: false, available: true } };
  const bulkHtml = reports.toHtml(bulkReport);
  const bulkMd = reports.toMarkdown(bulkReport);
  ok(bulkHtml.includes(newest) && bulkMd.includes(newest),
    `25a. the newest register row (${newest}) is rendered when the register is truncated`);
  ok(!bulkHtml.includes(oldest) && !bulkMd.includes(oldest),
    `25b. the oldest row (${oldest}) is the one dropped, not the newest`);
  ok(/most recent of 60 records, newest first/.test(bulkHtml) && /most recent of 60 records, newest first/.test(bulkMd),
    "25c. the document discloses that it shows the most recent records, newest first");

  console.log(`\nconnector audit projection test: ${pass} passed, ${fail} failed`);
  if (fail) { console.log("FAILURES:"); for (const f of fails) console.log("  ✗ " + f); }
  try { fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true }); } catch { /* */ }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("connector audit test crashed:", e); process.exit(1); });
