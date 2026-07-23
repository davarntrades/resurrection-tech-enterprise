/* ============================================================================
 * Operations Agent — Enterprise Memory / Evidence Graph test (Phase 3).
 *
 * Hermetic (mock engine, temp store). Proves the derived, read-only memory:
 *
 *   1. DERIVED + LINKED — the graph is built from real records; every derived
 *      node (lifecycle, snapshot) traces back to the facts/evidence behind it.
 *   2. PROVENANCE — nodes are classified (observed_fact / deterministic_
 *      derivation / model_interpretation / recommendation / approved_decision);
 *      no observed_fact stands without a supporting record.
 *   3. CONTRADICTIONS SURFACED — a genuine inconsistency (executed-but-
 *      unverified) is flagged, never silently resolved.
 *   4. REPLAY — the governed decision timeline is reconstructed in order.
 *   5. TRACE — any recommendation traces back to its verdict + approval +
 *      evidence.
 *   6. TENANT ISOLATION — one org's graph never contains another org's nodes;
 *      a graph requires an org_id.
 *
 *   node scripts/ops/graph.test.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-graph-test-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { startMockEngine } = require("./mock-engine.cjs");

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); }
}

async function main() {
  const srv = await startMockEngine();
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${srv.address().port}`;
  const ops = require("../../lib/ops");
  const rt = require("../../lib/runtime");
  const G = ops.graph;
  console.log("\nEnterprise Memory / Evidence Graph test (mock engine on :" + srv.address().port + ")\n");

  // Two orgs — one rich, one to prove isolation.
  const acme = await rt.admin.createOrg({ name: "Acme Corp", slug: "acme" });
  await rt.engagement.addContact(acme.id, { name: "Alice", email: "alice@acme.com", role: "Lead" });
  const other = await rt.admin.createOrg({ name: "Other Co", slug: "other" });
  await rt.engagement.addContact(other.id, { name: "Zoe", email: "zoe@other.com" });

  // Governed activity on acme: a recommendation (executed) + an incident + a snapshot.
  const rec = await ops.proposals.propose({ action_id: "create_recommendation", org_id: acme.id, params: { org_id: acme.id, title: "Reach out", severity: "low" } });
  await ops.proposals.propose({ action_id: "refresh_customer_intelligence", org_id: acme.id, params: { org_id: acme.id } });
  await ops.proposals.propose({ action_id: "open_incident", org_id: acme.id, params: { kind: "manual", summary: "look into X", org_id: acme.id } });

  // ── 1–2. Build + provenance ────────────────────────────────────────────────
  const graph = await G.build(acme.id);
  ok(graph && graph.nodes.length > 0, "the graph builds from real records", graph && graph.nodes.length);
  const types = new Set(graph.nodes.map((n) => n.type));
  ok(types.has("org") && types.has("contact") && types.has("proposal") && types.has("evidence") && types.has("lifecycle"), "core node types are present", [...types]);
  const classes = new Set(graph.nodes.map((n) => n.provenance));
  ok(classes.has("observed_fact") && classes.has("recommendation") && classes.has("deterministic_derivation"), "nodes carry provenance classes", graph.provenance);
  const lifecycle = graph.nodes.find((n) => n.type === "lifecycle");
  ok(lifecycle && lifecycle.provenance === "deterministic_derivation" && lifecycle.derivation, "the lifecycle stage is a deterministic derivation with its reason", lifecycle && lifecycle.derivation);
  // Every observed_fact node resolves to a source_ref (support).
  ok(graph.nodes.filter((n) => n.provenance === "observed_fact").every((n) => !!n.source_ref), "no observed_fact stands without a supporting source_ref");

  // ── 3. Contradiction surfaced (executed-but-unverified) ───────────────────
  // Force one: an executed proposal whose verify() returns false. schedule_internal_review
  // on a real org verifies fine; instead tamper a stored proposal's execution to
  // unverified (simulating a real verifier failure already recorded).
  const evForced = await ops.proposals.propose({ action_id: "schedule_internal_review", org_id: acme.id, params: { org_id: acme.id, next_review_date: "2027-03-01" } });
  await rt.store.update("ops_proposals", evForced.id, { execution: { executed: true, verified: false, verification: { ok: false, detail: "forced for test" } } });
  const graph2 = await G.build(acme.id);
  ok(graph2.contradictions.some((c) => c.type === "executed_but_unverified"), "a real contradiction is SURFACED (executed but unverified), not silently resolved", graph2.contradictions.map((c) => c.type));

  // ── 4. Replay ordered ──────────────────────────────────────────────────────
  const timeline = await G.replay(acme.id);
  ok(timeline.length >= 3, "the governed decision timeline replays", timeline.length);
  const ordered = timeline.every((it, i) => i === 0 || String(timeline[i - 1].at) <= String(it.at));
  ok(ordered, "replay is in chronological order");

  // ── 5. Trace a recommendation to its evidence ──────────────────────────────
  const tr = await G.trace(acme.id, `proposal:${rec.id}`);
  ok(tr && tr.node && tr.provenance === "recommendation", "a proposal node traces with its provenance", tr && tr.provenance);
  ok(Array.isArray(tr.related) && tr.related.some((r) => r.node.type === "verdict"), "the trace connects the recommendation to its governance verdict", tr && tr.related.map((r) => r.node.type));
  ok(Array.isArray(tr.to_evidence) && tr.to_evidence.length > 0, "the trace resolves a path to evidence", tr && tr.to_evidence.length);

  // ── 6. Tenant isolation ────────────────────────────────────────────────────
  ok(graph.nodes.every((n) => !n.label.includes("Other Co") && n.id !== `org:${other.id}`), "acme's graph contains no other tenant's nodes");
  ok(graph.nodes.some((n) => n.id === `org:${acme.id}`) && !graph.nodes.some((n) => n.id === `org:${other.id}`), "the graph is strictly org-scoped");
  let threw = false;
  try { await G.build(""); } catch { threw = true; }
  ok(threw, "building a graph without an org_id is refused (tenant-scoped by construction)");

  console.log(`\n${pass}/${pass + fail} passed`);
  srv.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });
