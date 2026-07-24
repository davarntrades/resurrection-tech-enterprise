/* ============================================================================
 * Guardian OS v0 — Enterprise Twin + Executive Homepage test.
 *
 * Hermetic (mock engine, temp store). Proves Guardian OS is a unified executive
 * surface that NEVER becomes a second source of truth and NEVER bypasses the
 * governance spine:
 *
 *   1. DERIVED TWIN — build() projects the live org model (customers,
 *      departments, relationships, enterprise health) from the SAME
 *      authoritative records the platform already owns (intelligence = customers,
 *      agents = departments). It holds no state of its own.
 *   2. NOT A SECOND SOURCE OF TRUTH — entity() links INTO the Evidence Graph for
 *      provenance, and replay() delegates to the graph; the Twin re-derives no
 *      lineage of its own.
 *   3. DETERMINISTIC — identical records → identical projection (modulo the
 *      timestamp).
 *   4. GROUNDED HOMEPAGE — the seven CEO questions are answered from real
 *      records: what-to-approve is the actual escalated queue, needs-attention
 *      cites real incidents/refusals, and every consequence references a record.
 *   5. READ-ONLY + NO BYPASS — rendering the homepage mutates nothing (no new
 *      proposals, no council run); actions remain deep-links into the governed
 *      proposal → governor → approval → execution → evidence flow.
 *
 *   node scripts/ops/guardian.test.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-guardian-test-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.OPS_COORDINATION;

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
  console.log("\nGuardian OS v0 test (mock engine on :" + srv.address().port + ")\n");

  // Enterprise state: three customers, an escalated privileged proposal, an open
  // incident, and a governed refusal (security signal).
  const a = await rt.admin.createOrg({ name: "Aster Systems", slug: "aster" });
  const q = await rt.admin.createOrg({ name: "Quantm", slug: "quantm" });
  const v = await rt.admin.createOrg({ name: "Vertex Freight", slug: "vertex" });
  await rt.engagement.set(a.id, { stage: "enterprise_assessment" });
  const esc = await ops.proposals.propose({ action_id: "send_confidential_report", org_id: q.id, params: { org_id: q.id } });
  ok(esc.status === "escalated", "seeded an escalated privileged proposal (awaits operator)", esc.status);
  await ops.incidents.open({ severity: "critical", kind: "ops_incident", summary: "engine flapping", org_id: v.id, opened_by: "test" });
  await ops.proposals.propose({ action_id: "share_credentials", org_id: q.id, params: {} }); // governed refusal

  // ── 1. Derived twin ────────────────────────────────────────────────────────
  const t = await ops.twin.build();
  ok(t.customers.length === 3 && t.kernel === "runtime_governance", "twin projects all customers over the governance kernel", { n: t.customers.length });
  ok(t.departments.length === ops.agents.AGENTS.length, "departments ARE the existing governed specialists (not invented)", t.departments.length);
  const deptIds = t.departments.map((d) => d.id).sort();
  const agentIds = ops.agents.AGENTS.map((x) => x.id).sort();
  ok(JSON.stringify(deptIds) === JSON.stringify(agentIds), "every department maps 1:1 to a council agent", deptIds);
  ok(t.enterprise.health.length === 5 && t.enterprise.health.every((d) => ["ok", "watch", "at_risk"].includes(d.band)), "enterprise health has five governed dimensions with deterministic bands", t.enterprise.health.map((d) => d.dimension));
  ok(t.customers.every((c) => t.relationships.some((r) => r.from === c.org_id && r.to === "runtime_governance" && r.kind === "governed_by")), "every customer carries a governed_by edge to the kernel");
  ok(t.enterprise.security.governed_refusals_7d >= 1, "twin surfaces the governed refusal from evidence (never recomputed)", t.enterprise.security);

  // ── 2. Not a second source of truth: links into the graph, delegates replay ─
  const entity = await ops.twin.entity(a.id);
  ok(!!entity && entity.graph_ref.includes(a.id) && entity.provenance, "entity() links INTO the Evidence Graph for provenance (no duplicate lineage)", entity && entity.graph_ref);
  const twinReplay = await ops.twin.replay(a.id);
  const graphReplay = await ops.graph.replay(a.id);
  ok(JSON.stringify(twinReplay) === JSON.stringify(graphReplay), "replay() delegates to the Evidence Graph (single replay authority)");

  // ── 3. Deterministic projection ────────────────────────────────────────────
  const t2 = await ops.twin.build();
  const strip = (x) => { const { generated_at, ...rest } = x; return JSON.stringify(rest); };
  ok(strip(t) === strip(t2), "the twin is deterministic (identical records → identical projection)");

  // ── 4. Grounded executive homepage ─────────────────────────────────────────
  const home = await ops.guardian.homepage();
  ok(home.what_to_approve.some((p) => p.id === esc.id), "‘what to approve today’ is the real escalated-proposal queue", home.what_to_approve.map((p) => p.action_id));
  ok(home.needs_attention.some((n) => n.kind === "incident") && home.needs_attention.some((n) => n.kind === "security"), "‘what needs attention’ cites the real incident + security refusal", home.needs_attention.map((n) => n.kind));
  ok(Array.isArray(home.if_we_do_nothing) && home.if_we_do_nothing.length >= 1 && home.if_we_do_nothing.every((c) => !!c.ref), "‘if we do nothing’ is a consequence projection, every item traceable to a record", home.if_we_do_nothing.length);
  ok(!!home.biggest_opportunity && !!home.biggest_risk, "homepage names a biggest opportunity + biggest risk");
  ok(home.enterprise_health.length === 5 && home.what_is_happening.customers === 3, "homepage carries enterprise health + live state");
  ok(home.what_to_approve.every((p) => p.ref.startsWith("/admin/operations")), "every approvable item deep-links into the governed flow (never executes here)");

  // ── 5. Read-only + no bypass: rendering mutates nothing ────────────────────
  const propsBefore = (await ops.proposals.list({ limit: 500 })).length;
  const runsBefore = (await rt.store.find("ops_runs", {})).length;
  await ops.guardian.homepage();
  await ops.twin.build();
  const propsAfter = (await ops.proposals.list({ limit: 500 })).length;
  const runsAfter = (await rt.store.find("ops_runs", {})).length;
  ok(propsBefore === propsAfter && runsBefore === runsAfter, "Guardian OS mutates nothing — no new proposals, no council run", { propsBefore, propsAfter, runsBefore, runsAfter });

  console.log(`\n${pass}/${pass + fail} passed`);
  srv.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });
