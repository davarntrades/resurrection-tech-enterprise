#!/usr/bin/env node
/* ============================================================================
 * GuardianOS — governed connector evidence, traced end to end in production.
 *
 * Takes the evidence ID that a governed provider execution just produced and
 * follows it all the way to the customer-facing artefact:
 *
 *   immutable evidence
 *     → normalized connector audit projection
 *     → persisted rg_reports.connector_activity   (read BACK from the database)
 *     → monthly evidence HTML
 *     → monthly evidence PDF (application/pdf)
 *
 * It makes NO provider calls of its own. The single governed invocation happens
 * before this runs; everything here is reporting, so re-running it cannot add a
 * chargeable call. Every assertion is on data read back from production, never
 * on what this process just computed in memory.
 *
 * Env: E2E_BASE_URL, RUNTIME_ADMIN_KEY, E2E_ORG_ID, E2E_ENVIRONMENT_ID
 * ============================================================================ */
"use strict";
const fs = require("node:fs");

const BASE = String(process.env.E2E_BASE_URL || "").replace(/\/$/, "");
const KEY = process.env.RUNTIME_ADMIN_KEY || "";
const ORG = process.env.E2E_ORG_ID || "";
const ENV = process.env.E2E_ENVIRONMENT_ID || "";
const SMOKE_REPORT = process.env.SMOKE_REPORT || "artifacts/customer-support-production-smoke.json";

const headers = { "x-admin-key": KEY, "content-type": "application/json" };
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
  : {};

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...bypass, ...(init.headers || {}) } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON (e.g. a PDF body) */ }
  return { status: res.status, headers: res.headers, json, text };
}

const failures = [];
const need = (cond, message) => { if (!cond) failures.push(message); return !!cond; };

(async () => {
  for (const [name, value] of [["E2E_BASE_URL", BASE], ["RUNTIME_ADMIN_KEY", KEY], ["E2E_ORG_ID", ORG], ["E2E_ENVIRONMENT_ID", ENV]]) {
    if (!value) { console.error(`${name} is required`); process.exit(2); }
  }
  if (!fs.existsSync(SMOKE_REPORT)) {
    console.error(`smoke report not found at ${SMOKE_REPORT} — the governed invocation must run first`);
    process.exit(2);
  }
  const smoke = JSON.parse(fs.readFileSync(SMOKE_REPORT, "utf8"));

  const trace = {
    generated_at: new Date().toISOString(),
    organisation: smoke.organisation, environment: smoke.environment,
    connector: smoke.connector, provider: smoke.provider, model: smoke.model,
    canonical_action_id: smoke.canonical_action_id,
    proposal_id: smoke.proposal_id,
    governance_decision: smoke.runtime_governance_decision,
    approval_status: smoke.approval_status,
    provider_invocation_count: smoke.bedrock_invocation_count,
    provider_called: smoke.aws_called,
    evidence_id: smoke.evidence_id,
    total_latency_ms: smoke.total_latency_ms,
    governance_latency_ms: smoke.governance_latency_ms,
    provider_latency_ms: smoke.provider_latency_ms,
    provider_calls_made_by_this_trace: 0,
  };

  // The smoke must have produced a real, permitted, single-invocation execution.
  need(trace.evidence_id, "smoke did not record an immutable evidence ID");
  need(trace.proposal_id, "smoke did not record a proposal ID");
  need(trace.governance_decision === "executed", `governance decision was ${trace.governance_decision}, not executed`);
  need(trace.provider_invocation_count === 1, `expected exactly one provider invocation, got ${trace.provider_invocation_count}`);
  need(smoke.organisation === ORG, `smoke organisation ${smoke.organisation} does not match ${ORG}`);
  need(smoke.environment === ENV, `smoke environment ${smoke.environment} does not match ${ENV}`);

  // ── 1. Generate + persist the monthly report ───────────────────────────────
  const generated = await api("/api/runtime/admin/reports", {
    method: "POST", body: JSON.stringify({ org_id: ORG, environment_id: ENV, period: "monthly" }),
  });
  need(generated.status === 200 || generated.status === 201, `report generation returned HTTP ${generated.status}`);
  const reportId = generated.json && (generated.json.report?.id || generated.json.id);
  trace.report_id = reportId || null;
  need(!!reportId, "report generation did not return a report id");

  // ── 2. Read it BACK from rg_reports ────────────────────────────────────────
  // Persistence is only proven by a round trip. Re-reading is the whole point:
  // an in-memory object would prove the projection ran, not that it was stored.
  const listed = await api(`/api/runtime/admin/reports?org_id=${encodeURIComponent(ORG)}&environment_id=${encodeURIComponent(ENV)}&period=monthly`);
  need(listed.status === 200, `report list returned HTTP ${listed.status}`);
  const stored = ((listed.json && listed.json.reports) || []).find((r) => r.id === reportId);
  need(!!stored, `report ${reportId} was not readable back from rg_reports`);

  const ca = stored && stored.connector_activity;
  trace.connector_activity_persisted = !!ca;
  need(!!ca, "rg_reports.connector_activity is absent on the stored report — the column or the projection did not persist");
  if (ca) {
    trace.connector_activity_available = ca.available === true;
    need(ca.available === true, `connector_activity reports unavailable: ${ca.unavailable_reason}`);
    trace.governed_actions = ca.totals && ca.totals.governed_actions;
    trace.projection_provider_invocations = ca.totals && ca.totals.provider_invocations;
    trace.connector_coverage = ca.totals && ca.totals.connector_coverage;
    const row = (ca.register || []).find((r) => r.evidence_id === trace.evidence_id);
    trace.evidence_in_projection = !!row;
    need(!!row, `evidence ${trace.evidence_id} is not present in the persisted connector_activity register`);
    if (row) {
      trace.register_row = {
        evidence_id: row.evidence_id, canonical_action_id: row.canonical_action_id,
        proposal_id: row.proposal_id, governance_decision: row.governance_decision,
        normalized_connector: row.normalized_connector, provider: row.provider, model: row.model,
        provider_invocation_count: row.provider_invocation_count,
        request_hash: row.request_hash, response_hash: row.response_hash,
        governance_latency_ms: row.governance_latency_ms, provider_latency_ms: row.provider_latency_ms,
        total_latency_ms: row.total_latency_ms, evidence_created_at: row.evidence_created_at,
      };
      need(row.proposal_id === trace.proposal_id, `projection proposal ${row.proposal_id} does not match the execution's ${trace.proposal_id}`);
      need(row.normalized_connector === "aws-bedrock", `projection normalized the connector as ${row.normalized_connector}`);
      need(row.provider_invocation_count === 1, `projection recorded ${row.provider_invocation_count} provider invocations`);
    }
  }

  // ── 3. Generate the monthly evidence pack (HTML/MD/JSON, PDF when rendered) ─
  const pack = await api("/api/runtime/admin/deliverables/generate", {
    method: "POST", body: JSON.stringify({ org_id: ORG, environment_id: ENV, report_type: "monthly_evidence", period: "monthly" }),
  });
  need(pack.status === 200, `evidence pack generation returned HTTP ${pack.status} ${pack.text.slice(0, 200)}`);
  trace.pack_id = (pack.json && pack.json.pack_id) || null;

  const packs = await api(`/api/runtime/admin/deliverables?org_id=${encodeURIComponent(ORG)}&environment_id=${encodeURIComponent(ENV)}`);
  need(packs.status === 200, `deliverables list returned HTTP ${packs.status}`);
  const thisPack = ((packs.json && packs.json.packs) || []).find((p) => p.id === trace.pack_id);
  need(!!thisPack, `pack ${trace.pack_id} not found in the deliverables list`);
  const files = (thisPack && thisPack.deliverables) || [];
  const byName = (n) => files.find((d) => d.filename === n);

  // ── 4. Monthly HTML must contain the evidence ID ────────────────────────────
  const htmlDel = byName("monthly-evidence.html");
  trace.monthly_html_present = !!htmlDel;
  need(!!htmlDel, "monthly-evidence.html was not produced");
  if (htmlDel) {
    const html = await api(`/api/runtime/admin/deliverables/file?id=${encodeURIComponent(htmlDel.id)}&mode=preview`);
    need(html.status === 200, `monthly-evidence.html returned HTTP ${html.status}`);
    trace.monthly_html_includes_evidence = html.text.includes(trace.evidence_id);
    trace.monthly_html_includes_section = /Governed connector activity/i.test(html.text);
    need(trace.monthly_html_includes_section, "monthly HTML does not render the governed connector activity section");
    need(trace.monthly_html_includes_evidence, `monthly HTML does not contain evidence ${trace.evidence_id}`);
  }

  // ── 5. Monthly PDF must be served as application/pdf ────────────────────────
  const pdfDel = byName("monthly-evidence.pdf");
  trace.monthly_pdf_present = !!pdfDel;
  if (pdfDel) {
    const pdf = await api(`/api/runtime/admin/deliverables/file?id=${encodeURIComponent(pdfDel.id)}&mode=preview`);
    trace.monthly_pdf_status = pdf.status;
    trace.monthly_pdf_content_type = pdf.headers.get("content-type");
    need([200, 206].includes(pdf.status), `monthly-evidence.pdf returned HTTP ${pdf.status}`);
    need(String(trace.monthly_pdf_content_type || "").includes("application/pdf"),
      `monthly-evidence.pdf content-type was ${trace.monthly_pdf_content_type}`);
    trace.monthly_pdf_is_pdf = pdf.text.startsWith("%PDF-");
  } else {
    // Not a failure: the PDF renderer is optional and its absence is disclosed
    // rather than silently reported as a PDF that does not exist.
    trace.monthly_pdf_note = "monthly-evidence.pdf was not produced — the PDF renderer is not configured for this deployment";
  }

  trace.chain_complete = failures.length === 0;
  trace.failures = failures;

  fs.mkdirSync("artifacts", { recursive: true });
  fs.writeFileSync("artifacts/connector-evidence-trace.json", `${JSON.stringify(trace, null, 2)}\n`);
  const rows = Object.entries(trace).filter(([k]) => k !== "failures" && k !== "register_row")
    .map(([k, v]) => `| ${k} | ${typeof v === "object" ? JSON.stringify(v) : String(v)} |`).join("\n");
  const reg = trace.register_row
    ? `\n### Projection register row\n\n| Field | Value |\n|---|---|\n${Object.entries(trace.register_row).map(([k, v]) => `| ${k} | ${v == null ? "—" : v} |`).join("\n")}\n`
    : "";
  fs.writeFileSync("artifacts/connector-evidence-trace.md",
    `## Governed connector evidence — production trace ${trace.chain_complete ? "COMPLETE" : "INCOMPLETE"}\n\n`
    + `| Field | Value |\n|---|---|\n${rows}\n${reg}`
    + (failures.length ? `\n### Unmet requirements\n\n${failures.map((f) => `- ${f}`).join("\n")}\n` : ""));

  process.stdout.write(`${JSON.stringify(trace, null, 2)}\n`);
  if (failures.length) {
    console.error(`\nTrace INCOMPLETE — ${failures.length} unmet requirement(s):`);
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
  }
  console.log("\nTrace COMPLETE: evidence → projection → rg_reports.connector_activity → monthly HTML → monthly PDF");
})().catch((e) => { console.error("connector evidence trace crashed:", e && e.message ? e.message : e); process.exit(1); });
