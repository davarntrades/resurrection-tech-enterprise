#!/usr/bin/env node
/* Runtime Governance — report summarize/render + inline-share (file store). */
"use strict";
const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-rep-"));
const reports = require("../../lib/runtime/reports");
const deliverables = require("../../lib/runtime/deliverables");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };

const report = {
  id: "rep_1", org_id: "org_r", environment_id: "env_r", period: "monthly",
  window: { since: "2026-06-01T00:00:00Z", until: "2026-07-01T00:00:00Z" }, generated_at: "2026-07-01T00:00:00Z",
  headline: "Governed 10 trajectories.", trajectories: 10,
  totals: { ALLOW: 6, ESCALATE: 1, BLOCK: 3 }, engine_verdicts: { BLOCK: 3 }, would_block: 2,
  enforced: 3, human_review: 1, latency: { engine_compute_ms: { mean: 0.5, p95: 0.9 } },
  top_rules: [{ key: "finance_x", count: 3, pct: 30 }], top_omega: [{ key: "finance", count: 3, pct: 30 }],
};

(async () => {
  const s = reports.summarize(report);
  ok(s.executive && ["Low", "Medium", "High"].includes(s.executive.risk), "summarize returns an executive risk level");
  ok(Array.isArray(s.executive.key_findings) && s.executive.key_findings.length > 0, "executive has key findings");
  ok(s.executive.risk === "High", `3/10 blocked → High risk (got ${s.executive.risk})`);
  ok(s.technical && s.technical.decisions === 10 && s.technical.rules.length === 1, "technical summary carries metrics");

  const md = reports.toMarkdown(report); const html = reports.toHtml(report);
  ok(md.includes("Governance Evidence") && md.includes("| ALLOW"), "toMarkdown renders");
  ok(html.startsWith("<!doctype html>") && html.includes("Executive summary") && html.includes("High"), "toHtml renders exec summary + risk");

  // Inline share of the rendered report → resolvable, then revocable.
  const share = await deliverables.shareInline({ org_id: "org_r", environment_id: "env_r", filename: "report.html", bytes: Buffer.from(html, "utf8"), mime: "text/html" });
  ok(share.token && share.path.includes(share.token), "shareInline mints a link");
  const r = await deliverables.resolveShare(share.token);
  ok(r.ok && Buffer.from(r.bytes).toString().includes("Executive summary"), "shared report resolves to the HTML");
  await deliverables.revokeShare(share.token);
  ok(!(await deliverables.resolveShare(share.token)).ok, "revoked report link is rejected");

  console.log(`\nreports test: ${pass} passed, ${fail} failed`);
  if (fail) { console.log("FAILURES:"); for (const f of fails) console.log("  ✗ " + f); }
  try { fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true }); } catch { /* */ }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("reports test crashed:", e); process.exit(1); });
