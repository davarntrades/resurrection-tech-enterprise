#!/usr/bin/env node
/* ============================================================================
 * Runtime Governance platform — end-to-end test.
 *
 * Exercises the whole "yes after audit → integrate immediately" path against
 * the live engine, using the local file store (no Supabase / no Next server
 * needed): onboarding, API-key auth + RBAC, multi-tenant isolation, continuous
 * ingestion, shadow vs enforce, manifest versioning + diff, metrics, trends,
 * search, export, decision replay (exact + shape-only), and period reporting.
 *
 *   GOVERNANCE_URL=… GOVERNANCE_TOKEN=… node scripts/runtime/gateway.test.cjs
 * ============================================================================ */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Isolated data dir per run so the test is hermetic.
process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-gw-test-"));
const rt = require("../../lib/runtime");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; } else { fail++; fails.push(m); } };
const eq = (g, w, m) => ok(JSON.stringify(g) === JSON.stringify(w), `${m} — expected ${JSON.stringify(w)}, got ${JSON.stringify(g)}`);

(async () => {
  const health = await rt.health();
  if (!health.engine.reachable) {
    console.log("Runtime gateway test SKIPPED — engine not reachable (set GOVERNANCE_URL + GOVERNANCE_TOKEN).");
    process.exit(0);
  }
  ok(health.store.backend === "file", "uses local file store in test");

  // ── Onboarding + tenancy ───────────────────────────────────────────────────
  const acme = await rt.admin.onboardCustomer({ name: "Acme Bank", slug: "acme" });
  const beta = await rt.admin.onboardCustomer({ name: "Beta Health", slug: "beta" });
  ok(acme.ingest_key && acme.ingest_key.startsWith("rtk_live_"), "onboarding returns a live ingest key");
  eq(acme.environments.map((e) => e.kind).sort(), ["production", "sandbox", "staging"], "onboarding creates prod + staging + sandbox");
  // Production now starts in ENFORCE. It used to start in shadow, and shadow
  // returned ALLOW unconditionally — so an unconfigured production environment
  // recorded that it would have blocked a catastrophic action and then let it
  // through. Staging/sandbox still start in shadow.
  eq(acme.production.mode, "enforce", "production starts in ENFORCE mode");
  eq(acme.environments.find((e) => e.kind === "staging").mode, "shadow",
     "staging still starts in shadow");

  // ── Auth + RBAC ────────────────────────────────────────────────────────────
  const authA = await rt.admin.authenticate(acme.ingest_key);
  ok(authA && authA.org.id === acme.org.id, "valid key authenticates to its org");
  ok((await rt.admin.authenticate("rtk_live_bogus")) === null, "bogus key rejected");
  const viewerIssue = await rt.admin.issueApiKey({ org_id: acme.org.id, role: "viewer", label: "dash" });
  const viewerAuth = await rt.admin.authenticate(viewerIssue.key, { requireRole: "ingest" });
  ok(viewerAuth === null, "viewer key cannot pass an ingest-role gate (RBAC)");

  // ── Manifest versioning + change detection + diff ──────────────────────────
  const m1 = await rt.manifests.putManifest({ org_id: acme.org.id, environment_id: acme.production.id, manifest: [{ name: "read_account" }, { name: "transfer_funds" }], domains: ["finance"] });
  ok(m1.changed && m1.version.version === 1, "first manifest is v1");
  const m1b = await rt.manifests.putManifest({ org_id: acme.org.id, environment_id: acme.production.id, manifest: [{ name: "transfer_funds" }, { name: "read_account" }], domains: ["finance"] });
  ok(m1b.changed === false, "reordered identical manifest is NOT a change (content-hash)");
  const m2 = await rt.manifests.putManifest({ org_id: acme.org.id, environment_id: acme.production.id, manifest: [{ name: "read_account" }, { name: "transfer_funds" }, { name: "wire_transfer" }], domains: ["finance"] });
  ok(m2.changed && m2.version.version === 2, "adding a tool creates v2");
  eq(m2.diff.added, ["wire_transfer"], "diff reports the added tool");
  eq((await rt.manifests.manifestHistory(acme.org.id, acme.production.id)).length, 2, "history keeps both versions");

  // ── Continuous ingestion — shadow OBSERVES but no longer overrides ────────
  // Shadow used to return ALLOW whatever the engine said. It now only annotates:
  // `enforced` stays false and `shadow_observed_only` is recorded, but a hard
  // verdict is never downgraded. This is the regression that matters most in
  // this file — a governance layer must not be able to observe its own bypass.
  await rt.admin.setMode(acme.production.id, "shadow");
  const authShadow = await rt.admin.authenticate(acme.ingest_key);
  const safe = await rt.gateway.govern({ auth: authShadow, trajectory: [{ tool: "read_account", args: {} }], domains: ["finance"], label: "read" });
  const bad = await rt.gateway.govern({ auth: authShadow, trajectory: [{ tool: "transfer_funds", args: { destination_account: "attacker" } }], domains: ["finance"], label: "wire" });
  eq(safe.verdict, "ALLOW", "shadow: safe trajectory ALLOW");
  eq(bad.verdict, "BLOCK", "shadow: catastrophic trajectory is BLOCKED, not observed-and-allowed");
  eq(bad.engine_verdict, "BLOCK", "shadow: engine verdict recorded");
  eq(bad.shadow_observed_only, true, "shadow: run is marked observe-only for reporting");
  eq(bad.enforced, false, "shadow: not counted as enforced");
  ok(bad.omega_domain === "finance" && bad.rule, "decision carries Ω domain + rule");
  ok(typeof bad.engine_compute_ms === "number", "decision carries engine compute time");

  // ── Enforce mode — the block becomes authoritative (instant cutover) ───────
  await rt.admin.setMode(acme.production.id, "enforce");
  const authA2 = await rt.admin.authenticate(acme.ingest_key);
  const badE = await rt.gateway.govern({ auth: authA2, trajectory: [{ tool: "transfer_funds", args: { destination_account: "attacker" } }], domains: ["finance"] });
  eq(badE.verdict, "BLOCK", "enforce: catastrophic trajectory is BLOCKED");
  ok(badE.enforced === true, "enforce: decision marked enforced");
  // Rollback is a mode flip — no redeploy.
  await rt.admin.setMode(acme.production.id, "shadow");
  eq((await rt.admin.getEnvironment(acme.production.id)).mode, "shadow", "rollback to shadow via mode flip");

  // ── ESCALATE tier (read → recommendation, human review) ────────────────────
  const esc = await rt.gateway.govern({ auth: await rt.admin.authenticate(acme.ingest_key), trajectory: [{ tool: "read_account", args: {} }, { tool: "recommend_transfer", args: { proposal: "x" } }], domains: ["finance"] });
  eq(esc.engine_verdict, "ESCALATE", "escalate tier detected");
  ok(esc.requires_human_review === true, "escalate flags human review");

  // ── Multi-tenant isolation ─────────────────────────────────────────────────
  const authB = await rt.admin.authenticate(beta.ingest_key);
  await rt.gateway.govern({ auth: authB, trajectory: [{ tool: "read_patient_record", args: {} }], domains: ["healthcare"] });
  const acmeMetrics = await rt.metrics.summary({ org_id: acme.org.id });
  const betaMetrics = await rt.metrics.summary({ org_id: beta.org.id });
  ok(acmeMetrics.total >= 4, "acme sees its own decisions");
  eq(betaMetrics.total, 1, "beta sees ONLY its own decision (tenant isolation)");

  // ── Metrics / trends / search / export ─────────────────────────────────────
  ok(acmeMetrics.rule_frequency.length >= 1, "rule frequency aggregated");
  ok(acmeMetrics.omega_frequency.some((o) => o.key === "finance"), "Ω-domain frequency aggregated");
  ok(acmeMetrics.would_block >= 1, "would-block count tracked");
  const trends = await rt.metrics.trends({ org_id: acme.org.id, bucket: "day" });
  ok(trends.length >= 1 && typeof trends[0].total === "number", "trend buckets produced");
  const blocks = await rt.store.queryDecisions({ org_id: acme.org.id, engine_verdict: "BLOCK", limit: 50 });
  ok(blocks.length >= 2, "searchable history filters by engine_verdict");
  const csv = await rt.metrics.exportDecisions({ org_id: acme.org.id, format: "csv" });
  ok(csv.contentType === "text/csv" && csv.body.split("\n").length >= 4, "CSV export of evidence");

  // ── Decision replay — shape-only vs exact ──────────────────────────────────
  const shapeReplay = await rt.gateway.replayDecision(bad.decision_id);
  eq(shapeReplay.replay_mode, "shape_only", "replay is shape-only when payloads not retained");
  ok(shapeReplay.deterministic === null, "shape-only replay does not overclaim determinism");
  await rt.admin.setStorePayloads(acme.production.id, true);
  const authA3 = await rt.admin.authenticate(acme.ingest_key);
  const exactDec = await rt.gateway.govern({ auth: authA3, trajectory: [{ tool: "transfer_funds", args: { destination_account: "attacker", amount: 99999 } }], domains: ["finance"] });
  const exactReplay = await rt.gateway.replayDecision(exactDec.decision_id);
  eq(exactReplay.replay_mode, "exact", "exact replay when payloads retained");
  ok(exactReplay.deterministic === true, "exact replay proves determinism (hash + verdict match)");

  // ── Continuous reporting ───────────────────────────────────────────────────
  for (const period of rt.reports.PERIODS) {
    const r = await rt.reports.generate({ org_id: acme.org.id, period, persist: false });
    ok(r.period === period && typeof r.headline === "string" && r.trajectories >= 0, `${period} report generated`);
  }
  const monthly = await rt.reports.generate({ org_id: acme.org.id, period: "monthly" });
  const md = rt.reports.toMarkdown(monthly);
  ok(md.includes("Governance Evidence") && md.includes("ALLOW"), "report renders board-ready markdown");
  eq((await rt.reports.listReports({ org_id: acme.org.id })).length, 1, "reports are persisted + listable");

  // ── report ──────────────────────────────────────────────────────────────────
  console.log(`\nRuntime gateway end-to-end: ${pass} passed, ${fail} failed`);
  if (fail) { console.log("\nFAILURES:"); for (const f of fails) console.log("  ✗ " + f); }
  try { fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("test crashed:", e); process.exit(1); });
