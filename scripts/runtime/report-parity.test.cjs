"use strict";
const reports = require("../../lib/runtime/reports");
const deliverables = require("../../lib/runtime/deliverables");
const kit = require("../delivery-kit.cjs");

let failed = 0;
function ok(value, label) { if (!value) { failed++; console.error(`FAIL: ${label}`); } else console.log(`PASS: ${label}`); }
function fontChecks(html, family) {
  ok(html.includes('name="viewport"'), `${family}: mobile viewport is declared`);
  ok(html.includes("max-width:600px") || html.includes("max-width: 600px"), `${family}: mobile screen layout is present`);
  ok(html.includes("TeX Gyre Pagella") && html.includes("TeX Gyre Heros"), `${family}: both font families selected`);
  const faces = html.match(/@font-face\s*\{[^}]+\}/g) || [];
  ok(faces.length >= 4 && faces.every((x) => /url\(data:font\//.test(x)), `${family}: font faces are embedded data URIs`);
  ok(!/@import\s+url\(/i.test(html) && !/src:\s*url\(https?:/i.test(html), `${family}: no external font request`);
}

const monthly = reports.toHtml({
  period: "monthly", window: { since: "2026-06-01", until: "2026-07-01" }, generated_at: "2026-07-01T00:00:00Z",
  headline: "Evidence", totals: { ALLOW: 1, ESCALATE: 0, BLOCK: 0 }, engine_totals: { ALLOW: 1 },
  trajectories: 1, would_block: 0, human_review: 0, latency: {}, top_rules: [], top_omega: [], recommendations: [], enforced: true,
});
fontChecks(monthly, "monthly evidence");
ok(monthly.includes("Resurrection Tech&trade; &middot; Confidential"), "monthly evidence: editorial confidentiality header");
ok(monthly.includes("Patent GB2600765.8"), "monthly evidence: branded editorial footer");
ok(monthly.includes("Evidence at a glance"), "monthly evidence: concise evidence structure retained");

const full = kit.auditHtml(
  { name: "Parity Test", environment: "production", reference: "RG-TEST" },
  { summary: { tools: 1, risky: 1, coverage_pct: 100, covered: 1, partial: 0, uncovered: 0 }, exposure: {}, grounded_blocks: [], attestation: {} },
  null, null, { reportType: "full_audit", replayResults: [], parsedTools: [{ name: "test_tool" }], domains: ["finance"], sector: "finance" }, [],
);
fontChecks(full, "full audit");

for (const filename of [
  "monthly-evidence.html", "monthly-evidence.md", "monthly-evidence.pdf",
  "executive-report.html", "executive-report.md", "executive-report.pdf",
  "full-audit.html", "full-audit.pdf", "full-audit-model.json",
]) ok(deliverables.KINDS[filename] && deliverables.KINDS[filename] !== "File", `Evidence Hub kind: ${filename}`);

if (failed) process.exit(1);
console.log("report parity test passed");
