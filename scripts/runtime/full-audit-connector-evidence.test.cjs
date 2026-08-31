#!/usr/bin/env node
/* ============================================================================
 * Runtime Governance — governed connector evidence in the full audit.
 *
 * audit.pdf is the document most likely to be handed to an auditor and treated
 * as complete. Until this change it carried no connector activity at all, so a
 * customer's governed Bedrock invocations were absent from the artefact their
 * auditor actually read — while being present in the monthly pack. One evidence
 * store, two documents, two different answers.
 *
 * The renderers already existed in delivery-kit.cjs and were already wired into
 * auditHtml; what was missing was fullaudit.js supplying the data. These tests
 * pin the whole path, and in particular the three ways it could go wrong
 * quietly: a missing section read as "nothing happened", a truncation the
 * document does not admit to, and the Markdown and PDF disagreeing.
 *
 * Fixtures only. No database, no network, no provider call, no renderer.
 * ============================================================================ */
"use strict";
const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-fa-conn-"));

const store = require("../../lib/runtime/store");
const reports = require("../../lib/runtime/reports");
const gateway = require("../../lib/runtime/integration-gateway");
const kit = require("../../scripts/delivery-kit.cjs");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };

const ORG = "org_fa", ENV = "env_fa";
const AT = "2026-07-15T09:30:00.000Z";

// A Bedrock evidence record as the governed path actually writes one.
async function bedrockEvidence(id, over = {}) {
  const evidence = {
    connector_id: "int_bedrock", proposal_id: over.proposal_id || "ops_bed_1",
    action_id: "aws.bedrock.invoke", outcome: "success",
    model_id: "anthropic.claude-sonnet-4", provider: "aws-bedrock",
    request_hash: "a".repeat(64), response_hash: "b".repeat(64),
    governance_latency_ms: 357, provider_latency_ms: 443, total_latency_ms: 1182,
    provider_invocation_count: 1, aws_called: true,
    ...(over.evidence || {}),
  };
  return store.insert("integration_events", {
    id, org_id: ORG, environment_id: ENV, type: "aws.bedrock.invocation", actor: "customer",
    evidence,
    evidence_hash: gateway.canonicalEvidenceHash(evidence),
    evidence_hash_alg: gateway.EVIDENCE_HASH_ALG,
    immutable: true, occurred_at: over.at || AT, created_at: over.at || AT,
  });
}

/** Build the connector-evidence object exactly as fullaudit.js does. */
async function connectorEvidence() {
  const fullaudit = require("../../lib/runtime/fullaudit");
  // connectorEvidenceFor is internal; drive the same public path it uses so the
  // test measures the real projection rather than a re-implementation.
  const until = store.nowISO();
  const window = { since: "1970-01-01T00:00:00.000Z", until };
  const ca = await reports.connectorActivityFor({ org_id: ORG, environment_id: ENV, window });
  const times = (ca.register || []).map((r) => r.executed_at).filter(Boolean).sort();
  void fullaudit;
  return {
    ...ca, window, window_label: "All recorded governed connector activity", window_until: until,
    activity_span: times.length ? { first: times[0], last: times[times.length - 1] } : null,
    register_note: reports.registerNote(ca),
    findings_note: reports.findingsNote(ca.findings),
    register_display: reports.REGISTER_DISPLAY,
    findings_display: reports.FINDINGS_DISPLAY,
  };
}

(async () => {
  await store.insert("orgs", { id: ORG, name: "Full Audit Co", status: "active" });
  await store.insert("environments", { id: ENV, org_id: ORG, name: "production", kind: "production" });
  await store.insert("integration_connectors", {
    id: "int_bedrock", org_id: ORG, environment_id: ENV, type: "aws-bedrock",
    name: "Production Bedrock", status: "configured", health: "healthy",
  });
  await store.insert("ops_proposals", {
    id: "ops_bed_1", org_id: ORG, environment_id: ENV,
    action_id: "aws.bedrock.invoke", status: "executed",
    decision: { verdict: "ALLOW", reason: "within policy", policy: "bedrock" },
  });
  await bedrockEvidence("int_ev_bedrock_1");

  // ══ 1. Bedrock activity reaches audit.pdf ════════════════════════════════
  const ce = await connectorEvidence();
  const html = kit.connectorEvidenceHtml(ce);
  const md = kit.connectorEvidenceMarkdown(ce).join("\n");

  ok(ce.register.length === 1, "0. the projection found the Bedrock evidence record");
  ok(html.includes("Governed connector evidence"), "1a. audit.pdf carries a governed connector evidence section");
  ok(html.includes("int_ev_bedrock_1"), "1b. the Bedrock evidence ID appears in audit.pdf");
  ok(/aws-bedrock/.test(html), "1c. the connector/provider appears");
  ok(html.includes("anthropic.claude-sonnet-4"), "1d. the model appears");
  ok(html.includes("aws.bedrock.invoke"), "1e. the canonical action appears");
  ok(html.includes("ops_bed_1"), "1f. the proposal ID appears");
  // Assert against the values the projection ACTUALLY produced rather than
  // guessed literals. governance_decision is derived from the proposal's
  // lifecycle status ("executed"), not from decision.verdict — the same value
  // the monthly pack prints, which is the point: one projection, one answer.
  const r0 = ce.register[0];
  ok(!!r0.governance_decision && html.includes(r0.governance_decision),
    `1g. the governance decision appears (${r0.governance_decision})`);
  ok(!!r0.execution_outcome && html.includes(r0.execution_outcome),
    `1h. the permit / execution outcome appears (${r0.execution_outcome})`);
  // And the audit must agree with the monthly pack on that same value, or the
  // two documents describe one execution differently.
  ok(reports.connectorMarkdown(ce).join("\n").includes(r0.governance_decision),
    "1g2. the monthly pack prints the same decision value for the same record");
  ok(/357 ms/.test(html) && /443 ms/.test(html) && /1182 ms/.test(html),
    "1i. governance, provider and total latency all appear");
  ok(html.includes("aaaaaaaaaaaaaaaa") && html.includes("bbbbbbbbbbbbbbbb"),
    "1j. request AND response hashes appear");
  ok(/verified/.test(html), "1k. the hash-verification status appears");
  ok(/All recorded governed connector activity/.test(html), "1l. the report window is stated");

  // The Markdown twin must carry the same facts — an auditor may read either.
  for (const [needle, label] of [
    ["int_ev_bedrock_1", "evidence ID"], ["anthropic.claude-sonnet-4", "model"],
    ["aws.bedrock.invoke", "canonical action"], ["ops_bed_1", "proposal ID"],
    ["357ms", "governance latency"], ["443ms", "provider latency"], ["1182ms", "total latency"],
  ]) ok(md.includes(needle), `1m. the Markdown carries the ${label}`);
  ok(/verified/.test(md), "1n. the Markdown carries the hash-verification status");

  // ══ 1b. The column is labelled for what it holds ════════════════════════
  // governance_decision carries the proposal's LIFECYCLE status ("executed"),
  // not an Ω verdict. Under a column headed "Decision" an auditor reads
  // "executed" as the verdict — which is not what it is, and the value cannot
  // be changed without moving the shared projection and the monthly pack with
  // it. So the audit renames the column instead.
  ok(/<th>Lifecycle status<\/th>/.test(html),
    "1o. the audit's register column is headed 'Lifecycle status', not 'Decision'");
  ok(!/<th>Decision<\/th>/.test(html),
    "1p. the misleading 'Decision' heading is gone from the audit register");
  ok(/\| Lifecycle status \|/.test(md) && !/\| Decision \|/.test(md),
    "1q. the Markdown register uses the same heading");
  ok(/not the .{0,3} verdict/i.test(html) && /not the .{0,3} verdict/i.test(md),
    "1r. both renderers state that lifecycle status is not the verdict");
  ok(/governance decision log/.test(html) && /governance decision log/.test(md),
    "1s. both point the reader at where the verdicts and refusals actually are");

  // The constraint on this change: the SHARED projection and the MONTHLY PACK
  // must be untouched. If the rename leaked into reports.js, the monthly pack
  // would silently change wording for every existing customer.
  const monthlyMd = reports.connectorMarkdown(ce).join("\n");
  const monthlyHtml = reports.connectorHtml(ce, (x) => String(x));
  ok(/\| Decision \|/.test(monthlyMd),
    "1t. the MONTHLY pack still heads the column 'Decision' — unchanged by this PR");
  ok(/<th>Decision<\/th>/.test(monthlyHtml),
    "1u. the monthly HTML pack is unchanged too");
  ok(!/Lifecycle status/.test(monthlyMd) && !/Lifecycle status/.test(monthlyHtml),
    "1v. the new heading did NOT leak into the monthly evidence pack");
  ok(r0.governance_decision === "executed",
    "1w. the underlying projection value is unchanged — only the audit's label moved");

  // ══ 1c. The register must physically fit the printed page ══════════════
  // Found in pre-acceptance: with auto table layout, one long model ID
  // (anthropic.claude-sonnet-4-5-20250929-v1:0) widened the 11-column table
  // past the 6.5in print area and CLIPPED the response-hash and hash-check
  // columns out of the PDF — present in the HTML, absent from the artefact an
  // auditor actually reads. Exactly the HTML/PDF divergence this section exists
  // to prevent, so it is pinned rather than left to visual review.
  ok(/<table class="creg">/.test(html),
    "1x. the register table carries the fixed-layout class");
  const cg = (html.match(/<colgroup>([\s\S]*?)<\/colgroup>/) || [])[1] || "";
  const widths = [...cg.matchAll(/width:(\d+)%/g)].map((m) => Number(m[1]));
  ok(widths.length === 11, `1y. every one of the 11 columns has an explicit width (${widths.length})`);
  ok(widths.reduce((a, b) => a + b, 0) === 100,
    `1z. the column widths sum to exactly 100% so nothing overflows the page (${widths.reduce((a, b) => a + b, 0)}%)`);

  // ══ 2. No activity must be STATED, not silently omitted ══════════════════
  const empty = {
    available: true, totals: { governed_actions: 0, permitted: 0, blocked: 0, escalated: 0, provider_invocations: 0 },
    connectors: [], register: [], register_total: 0, register_truncated: false, findings: [],
    window: { since: "1970-01-01T00:00:00.000Z", until: "2026-08-01T00:00:00.000Z" },
    window_label: "All recorded governed connector activity", window_until: "2026-08-01T00:00:00.000Z",
    activity_span: null, register_note: null, findings_note: null,
    register_display: 25, findings_display: 50,
  };
  const emptyHtml = kit.connectorEvidenceHtml(empty);
  const emptyMd = kit.connectorEvidenceMarkdown(empty).join("\n");
  ok(emptyHtml.includes("Governed connector evidence"),
    "2a. an empty window still renders the section rather than dropping it");
  ok(/No governed connector activity was recorded/.test(emptyHtml),
    "2b. audit.pdf says so in words");
  ok(/stated result, not an omitted section/.test(emptyHtml),
    "2c. it distinguishes 'nothing happened' from 'we left it out'");
  ok(emptyMd.includes("Governed connector evidence") && /No governed connector activity was recorded/.test(emptyMd),
    "2d. the Markdown states it too");

  // A projection that could not be built is NOT the same as no activity.
  const broken = { available: false, unavailable_reason: "projection unavailable", register: [], findings: [] };
  const brokenHtml = kit.connectorEvidenceHtml(broken);
  const brokenMd = kit.connectorEvidenceMarkdown(broken).join("\n");
  ok(/INCOMPLETE/.test(brokenHtml) && /projection unavailable/.test(brokenHtml),
    "2e. an unbuildable projection is reported as INCOMPLETE with the reason");
  ok(/does not mean no connector activity occurred/i.test(brokenHtml),
    "2f. it explicitly refuses the 'therefore nothing happened' reading");
  ok(/INCOMPLETE/.test(brokenMd) && /projection unavailable/.test(brokenMd),
    "2g. the Markdown reports the same incompleteness");

  // Supplying nothing at all (manifest-only CLI audit) still omits — there is
  // no evidence store to describe. This preserves the pre-existing contract.
  ok(kit.connectorEvidenceHtml(null) === "" && kit.connectorEvidenceMarkdown(null).length === 0,
    "2h. a caller that supplies no connector data at all still gets no section");

  // ══ 3. Truncation is disclosed, and identically in both renderers ════════
  const many = [];
  for (let i = 0; i < 40; i++) {
    many.push({
      evidence_id: "ev_" + String(i).padStart(4, "0"), executed_at: AT,
      canonical_action_id: "aws.bedrock.invoke", proposal_id: "ops_" + i,
      governance_decision: "ALLOW", execution_outcome: "succeeded",
      normalized_connector: "aws-bedrock", provider: "aws-bedrock", model: "claude",
      provider_invocation_count: 1, request_hash: "r".repeat(64), response_hash: "s".repeat(64),
      governance_latency_ms: 10, provider_latency_ms: 20, total_latency_ms: 30,
      evidence_hash_state: "verified",
    });
  }
  const findings60 = Array.from({ length: 60 }, (_, i) => ({ severity: "medium", kind: "k" + i, detail: "d" + i }));
  const truncated = {
    ...empty, connectors: [{ connector_id: "int_bedrock", connector_name: "Production Bedrock", normalized_connector: "aws-bedrock", provider: "aws-bedrock", governed_requests: 40, allow: 40, block: 0, escalate: 0, provider_calls: 40, failed_closed: 0, evidence_count: 40 }],
    register: many, register_total: 40, findings: findings60,
    register_note: reports.registerNote({ register: many, register_total: 40, register_truncated: false }),
    findings_note: reports.findingsNote(findings60),
  };
  const tHtml = kit.connectorEvidenceHtml(truncated);
  const tMd = kit.connectorEvidenceMarkdown(truncated).join("\n");

  ok(truncated.register_note && /most recent of 40 records/.test(truncated.register_note),
    "3a. the disclosure comes from the monthly pack's own helper, not a private copy");
  ok(tHtml.includes(truncated.register_note), "3b. audit.pdf prints the register disclosure verbatim");
  ok(tMd.includes(truncated.register_note), "3c. the Markdown prints the identical sentence");
  ok(tHtml.includes(truncated.findings_note) && tMd.includes(truncated.findings_note),
    "3d. the findings disclosure is identical in both renderers");
  ok(/Showing 50 of 60 integrity findings/.test(tHtml),
    "3e. the findings cap announces itself rather than cutting silently");
  ok(tHtml.includes("ev_0039") && !tHtml.includes("ev_0000"),
    "3f. the rows shown are the most recent, matching the sentence printed above them");
  ok(tMd.includes("ev_0039") && !tMd.includes("| ev_0000 |"),
    "3g. the Markdown shows the same rows as the HTML");

  // ══ 4. Traceability of the evidence ID and hashes ════════════════════════
  const row = ce.register[0];
  ok(row.evidence_id === "int_ev_bedrock_1", "4a. the register carries the immutable evidence ID");
  ok(row.request_hash === "a".repeat(64) && row.response_hash === "b".repeat(64),
    "4b. both hashes survive the projection unmodified");
  ok(row.evidence_hash_state === "verified" && row.evidence_hash_verified === true,
    "4c. the hash verifies — the audit reports an independently recomputed result");
  ok(html.includes(row.request_hash.slice(0, 16)) && html.includes(row.response_hash.slice(0, 16)),
    "4d. the rendered hashes are a prefix of the stored ones, so they are traceable back");
  ok(row.proposal_id === "ops_bed_1" && row.canonical_action_id === "aws.bedrock.invoke",
    "4e. the evidence remains linked to its proposal and canonical action");

  // A tampered payload must surface in the audit, not just in the monthly pack.
  await store.update("integration_events", "int_ev_bedrock_1", {
    evidence: { ...(await store.findOne("integration_events", { id: "int_ev_bedrock_1" })).evidence, outcome: "TAMPERED" },
  });
  const tampered = await connectorEvidence();
  ok(tampered.register[0].evidence_hash_state === "mismatch",
    "4f. an altered payload is detected by the same projection the audit renders");
  ok(/mismatch/.test(kit.connectorEvidenceHtml(tampered)),
    "4g. audit.pdf surfaces the mismatch rather than printing the stored hash unchallenged");

  // ══ 5. The section is wired into the audit document itself ═══════════════
  // Not just the helper: auditHtml must actually place it, or the whole change
  // is a function nobody calls.
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "scripts", "delivery-kit.cjs"), "utf8");
  ok(/\+ connectorEvidenceHtml\(ctx\.connector_evidence\)/.test(src),
    "5a. auditHtml composes the connector section into the audit page");
  ok(/connectorEvidenceMarkdown\(ctx\.connector_evidence\)/.test(src),
    "5b. the Markdown audit composes it too");
  const fa = fs.readFileSync(path.join(__dirname, "..", "..", "lib", "runtime", "fullaudit.js"), "utf8");
  ok(/connector_evidence,\s*\/\/ → governed connector evidence section/.test(fa),
    "5c. fullaudit.js supplies it through ctx — the wiring that was missing");
  // The single-source-of-truth requirement. Matching one spelling of the bypass
  // is not enough — require("./connector-audit").summary() evades a check for
  // `connectorAudit.summary(`. Assert fullaudit does not reach the projection
  // module by ANY route, so the only way in is through the monthly pack's own
  // entry point.
  ok(/reports\.connectorActivityFor\(/.test(fa),
    "5d. fullaudit reuses the monthly pack's projection entry point");
  ok(!/connector-audit/.test(fa),
    "5d2. fullaudit does not reference the audit projection module at all — no second source of truth");
  ok(/connectorEvidence: connector_evidence/.test(fa),
    "5e. the exported model carries the evidence, so full-audit-model.json is complete");

  console.log(`\nfull audit connector evidence test: ${pass} passed, ${fail} failed`);
  if (fail) { console.log("FAILURES:"); for (const f of fails) console.log("  ✗ " + f); }
  try { fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true }); } catch { /* */ }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("full audit connector evidence test crashed:", e); process.exit(1); });
