/* ============================================================================
 * Runtime Governance — Full 48-Hour Audit assembler (web).
 *
 * The full audit is a MANIFEST assessment product, distinct from the monthly
 * evidence report (which aggregates live rg_decisions telemetry). It is only
 * available for a customer that has a stored tool manifest (rg_manifests); the
 * assessment-dependent sections come from a live engine /v1/assess against that
 * manifest — never synthesised from runtime decisions.
 *
 * This module ASSEMBLES the evidence and reuses the existing 48-Hour Audit
 * generator (scripts/delivery-kit.cjs → auditHtml, exported). No report business
 * logic is duplicated here or placed in the renderer: the flow is
 *   stored manifest → live /v1/assess → full audit model → branded HTML → PDF.
 * Where an applicable section has no evidence in this window it is MARKED
 * "Not assessed in this reporting window" (auditHtml, ctx.reportType).
 * ============================================================================ */
"use strict";
const store = require("./store");
const admin = require("./admin");
const engine = require("./engine");
const metrics = require("./metrics");
const manifests = require("./manifests");
const reports = require("./reports");
const dk = require("../../scripts/delivery-kit.cjs");

/* Governed connector evidence for the full audit.
 *
 * Deliberately reuses reports.connectorActivityFor() — the SAME projection the
 * monthly evidence pack uses — rather than reading the evidence tables again.
 * Two projections over one evidence store would be two sources of truth, and
 * the first time they disagreed the audit would be arguing with itself.
 *
 * WINDOW. The full audit's other runtime sections (metrics.summary below) are
 * all-time for this org/environment, so the connector section matches them:
 * everything recorded, up to generation. Passing a narrower window would make
 * one document report two different periods without saying so.
 *
 * The disclosure wording comes from reports.registerNote/findingsNote, so the
 * audit and the monthly pack cannot describe the same truncation differently.
 */
const EPOCH = "1970-01-01T00:00:00.000Z";

async function connectorEvidenceFor(org_id, environment_id) {
  const until = store.nowISO();
  const window = { since: EPOCH, until };
  const ca = await reports.connectorActivityFor({ org_id, environment_id, window });

  // Render the span that actually contains evidence alongside the query window.
  // "1970 → today" is technically the window and tells a reader nothing; the
  // first and last executed_at are what they came for.
  const times = (ca.register || []).map((r) => r.executed_at).filter(Boolean).sort();
  return {
    ...ca,
    window,
    window_label: "All recorded governed connector activity",
    window_until: until,
    activity_span: times.length ? { first: times[0], last: times[times.length - 1] } : null,
    // Computed here, by the same helpers the monthly pack uses, so the renderer
    // prints a disclosure rather than inventing one.
    register_note: reports.registerNote(ca),
    findings_note: reports.findingsNote(ca.findings),
    register_display: reports.REGISTER_DISPLAY,
    findings_display: reports.FINDINGS_DISPLAY,
  };
}

const MANIFEST_REQUIRED =
  "Full audit unavailable — customer manifest required. Upload or ingest the customer's tool manifest before running /v1/assess.";

// Is a full audit possible for this customer? (Gates the Control Room button.)
async function availability(org_id, environment_id) {
  try {
    const m = await manifests.currentManifest(org_id, environment_id).catch(() => null);
    if (!m) return { available: false, reason: MANIFEST_REQUIRED };
    return { available: true, tool_count: (m.tools || []).length, manifest_version: m.version || null };
  } catch (e) {
    return { available: false, reason: (e && e.message) || "manifest lookup failed" };
  }
}

// Build the full audit: FullAuditReport model + branded HTML (for the renderer).
async function build({ org_id, environment_id }) {
  const t0 = Date.now();
  const org = await admin.getOrg(org_id);
  if (!org) throw Object.assign(new Error("organisation not found"), { code: "not_found" });
  const env = await admin.getEnvironment(environment_id);
  if (!env || env.org_id !== org_id) throw Object.assign(new Error("environment does not belong to this organisation"), { code: "cross_org" });

  // Stored manifest is mandatory — no synthesis from runtime decisions.
  const manifest = await manifests.currentManifest(org_id, environment_id);
  if (!manifest) throw Object.assign(new Error(MANIFEST_REQUIRED), { code: "no_manifest" });

  const domains = Array.isArray(manifest.domains) ? manifest.domains : (manifest.domains ? [manifest.domains] : []);
  const toolNames = Array.isArray(manifest.tools) ? manifest.tools : [];

  // ---- Assessment-dependent evidence: cached assess (authoritative, from the
  //      original manifest at ingest) augmented with a live /v1/assess for
  //      grounded blocks + attestation. ----
  const cached = manifest.assessment && manifest.assessment.ok ? manifest.assessment : null;
  const report = {
    summary: cached ? cached.summary : null,
    exposure: cached ? cached.exposure : null,
    grounded_blocks: [],
    attestation: null,
  };
  let assess_source = cached ? "cached" : null;
  const tAssess = Date.now();
  const res = await engine.assess(toolNames, domains).catch((e) => ({ ok: false, error: (e && e.message) || "assess error" }));
  const assessMs = Date.now() - tAssess;
  if (res && res.ok && res.json) {
    const j = res.json;
    report.grounded_blocks = j.grounded_blocks || [];
    report.attestation = j.attestation || null;
    if (!report.summary) report.summary = j.summary || null;
    if (!report.exposure || !Object.keys(report.exposure || {}).length) report.exposure = j.exposure || null;
    assess_source = cached ? "cached+live" : "live";
  }
  if (!report.summary) {
    throw Object.assign(new Error(`engine assessment produced no report: ${res && res.error ? res.error : "no summary"}`), { code: "assess_failed" });
  }

  // ---- Runtime latency (performance sections) from live telemetry. Shaped for
  //      the CLI's pipelineTimingHtml: engine compute vs round-trip, with counts.
  //      Throughput (eps) is not measured at report time → null (renders "—"). ----
  const sum = await metrics.summary({ org_id, environment_id }).catch(() => null);
  const compute = (sum && sum.latency && sum.latency.engine_compute_ms) || {};
  const roundTrip = (sum && sum.latency && sum.latency.round_trip_ms) || {};
  const evalCount = (sum && sum.total) || 0;
  const perf = (compute.mean != null || roundTrip.mean != null) ? {
    n: evalCount,
    mean: roundTrip.mean != null ? roundTrip.mean : compute.mean,
    computeN: compute.mean != null ? evalCount : 0,
    computeMean: compute.mean != null ? compute.mean : null,
    p50: compute.p50 ?? null, p95: compute.p95 ?? null, p99: compute.p99 ?? null, max: compute.max ?? null,
    eps: null,
  } : null;

  // ---- Attestation / evidence integrity from recorded decisions + hash chain. ----
  const recent = await store.queryDecisions({ org_id, environment_id, limit: 1 }).catch(() => []);
  if (!report.attestation && recent[0]) {
    report.attestation = { ruleset_hash: recent[0].ruleset_hash || null, service_version: recent[0].engine_commit || null, engine_commit: recent[0].engine_commit || null };
  }
  const chain = await store.verifyChain(org_id, environment_id).catch(() => null);

  // ---- Governed connector evidence chain (same projection as the monthly
  //      pack). Never throws: connectorActivityFor already degrades a
  //      projection fault to available:false with a stated reason, and the
  //      renderer prints that rather than dropping the section. ----
  const connector_evidence = await connectorEvidenceFor(org_id, environment_id);

  // ---- Sector from declared domains (domain-dominant detection). ----
  const sectorId = dk.sectorIdFor("", domains, undefined);

  // ---- Reuse the existing 48-Hour Audit generator. ----
  const reference = `RG-AUDIT-${String(env.id).slice(-6).toUpperCase()}-${new Date().toISOString().slice(0, 10)}`;
  const c = { name: org.name, environment: env.name || env.kind || "production", reference };
  const ctx = {
    reportType: "full_audit",                       // → mark missing sections, don't drop them
    parsedTools: toolNames.map((n) => ({ name: n })),
    industry: "", domains, sector: sectorId,
    replayResults: [],                              // replay determinism needs stored trajectories → Not assessed
    connector_evidence,                             // → governed connector evidence section
    governedResult: null,                           // no trajectory-linked envelope in a manifest-only audit
  };
  const replay = null;
  const stages = [
    { name: "Manifest resolution", ms: Math.max(0, tAssess - t0) },
    { name: "Engine assessment (/v1/assess)", ms: assessMs },
    { name: "Evidence assembly + render prep", ms: 0 },
  ];
  const html = dk.auditHtml(c, report, perf, replay, ctx, stages);

  // ---- FullAuditReport data contract (returned for the audit trail / API). ----
  const s = report.summary || {};
  const model = {
    organisation: { id: org.id, name: org.name },
    environment: { id: env.id, name: env.name || env.kind || null, mode: env.mode || null },
    reference,
    classification: "Confidential",
    sector: sectorId,
    summary: s,
    toolInventory: toolNames,
    riskBearingTools: s.risky ?? null,
    omegaCoverage: { coverage_pct: s.coverage_pct ?? null, covered: s.covered ?? null, partial: s.partial ?? null, uncovered: s.uncovered ?? null },
    omegaRiskClasses: report.exposure || {},
    blockedTrajectories: report.grounded_blocks || [],
    trajectoryReplays: ctx.replayResults,
    runtimeMetrics: perf ? { latency_ms: perf, evaluations: sum ? sum.total : null } : { status: "not_assessed" },
    auditPipelineMetrics: { stages, total_ms: Date.now() - t0 },
    evidenceHashes: {
      ruleset_hash: (report.attestation || {}).ruleset_hash || null,
      chain_intact: chain ? !!chain.ok : null,
      evidence_hash: ((report.grounded_blocks || []).find((b) => b && b.hash) || {}).hash || null,
    },
    // The complete register, not the rendered subset — the document truncates
    // for length and says so; the exported model is what the disclosure points
    // an auditor at, so truncating it too would make that sentence false.
    connectorEvidence: connector_evidence,
    safetyEnvelope: {
      availability: "not_supplied",
      status: null,
      claim: null,
      reason: "No trajectory-linked canonical Admissible Operating Envelope result was supplied for this manifest assessment.",
      boundary_warning: "This claim applies only to the declared tested envelope. No safety claim is inherited outside that envelope.",
    },
    recommendation: null,   // rendered in HTML via recommendEngagement
    commercialImpact: null, // rendered in HTML via sector investment summary
    meta: { assess_source, manifest_version: manifest.version || null, generated_at: store.nowISO() },
  };

  return { html, model, meta: model.meta };
}

module.exports = { availability, build, MANIFEST_REQUIRED };
