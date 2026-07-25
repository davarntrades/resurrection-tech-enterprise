/* ============================================================================
 * Guardian OS — Executive Workspaces test (Phase 4).
 *
 * Hermetic (mock engine, temp store). Proves the architecture's core promise:
 * ONE enterprise, ONE digital twin, ONE runtime governance engine, MANY
 * executive perspectives — every workspace a LENS over the same governed source
 * of truth, never a parallel system.
 *
 *   1. ROLES        eight executive perspectives (CEO/CTO/CISO/Risk/Compliance/
 *                   COO/CFO/Legal), each producing role-appropriate sections.
 *   2. ONE TWIN     the same governance score + estate appears across every
 *                   lens — the workspaces read the same context, not copies.
 *   3. PROJECTION   no new tables/collections are created by rendering a
 *                   workspace (pure read-only projection).
 *   4. HONESTY      metrics without a real source are explicit not-instrumented
 *                   notes, never fabricated numbers.
 *   5. EXTENSIBLE   the role set is data; adding one needs no kernel change.
 *
 *   node scripts/ops/workspaces.test.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-workspaces-test-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { startMockEngine } = require("./mock-engine.cjs");

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); }
}
const dataFiles = () => { try { return new Set(fs.readdirSync(process.env.RUNTIME_DATA_DIR)); } catch { return new Set(); } };

async function main() {
  const srv = await startMockEngine({ governancePolicies: true });
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${srv.address().port}`;
  const ops = require("../../lib/ops");
  const rt = require("../../lib/runtime");
  console.log("\nExecutive Workspaces test (mock engine on :" + srv.address().port + ")\n");

  // Provision + a monitoring pass + a real block so every lens has something.
  const prov = await ops.provisioning.provision({}, { actor: "davarn@control-room" });
  const org = prov.org_id;
  await ops.entities.create({ org_id: org, layer: "estate", kind: "tool", name: "exfiltrate_data", attrs: { privileged: true } });
  await ops.managed.monitor(org, { actor: "guardian_os" });
  await ops.managed.evidencePack(org, { actor: "davarn@control-room" });
  // A genuine blocked action so CISO/CFO have grounded evidence.
  await rt.engine.evaluate([{ tool: "wire_transfer", args: { amount: 25000 } }], ["enterprise"], 3);
  await ops.proposals.propose({ action_id: "wire_transfer", params: { amount: 25000 }, org_id: org, source: "test" }).catch(() => {});

  // ── 1. Eight roles, each projecting sections ──────────────────────────────
  const roles = ops.workspaces.roles();
  ok(roles.length === 8 && ["ceo", "cto", "ciso", "risk", "compliance", "coo", "cfo", "legal"].every((r) => roles.some((x) => x.id === r)), "eight executive perspectives are offered", roles.map((r) => r.id));
  ok(roles.every((r) => r.title && r.purpose), "every role carries a title + purpose for navigation");

  const built = {};
  for (const r of roles) built[r.id] = await ops.workspaces.workspace(r.id, org);
  ok(Object.values(built).every((w) => Array.isArray(w.sections) && w.sections.length >= 4), "every workspace renders role-appropriate sections", Object.fromEntries(Object.entries(built).map(([k, w]) => [k, w.sections.length])));

  // ── 2. ONE twin — the same numbers across every lens ──────────────────────
  const scores = Object.values(built).map((w) => w.header.governance.score);
  ok(new Set(scores).size === 1, "the SAME governance score appears in every workspace (one twin, not copies)", scores);
  // CTO estate systems count === CEO's ai_systems count === the real estate.
  const realSystems = (await ops.entities.forOrg(org, { kind: "ai_system" })).length;
  const ctoEstate = built.cto.sections.find((s) => s.key === "estate").items.find((i) => i.label === "AI systems").value;
  const ceoSystems = built.ceo.sections.find((s) => s.key === "state").items.find((i) => i.label === "AI systems live").value;
  ok(ctoEstate === realSystems && ceoSystems === realSystems, "CEO + CTO read the same AI-system count off the one estate", { cto: ctoEstate, ceo: ceoSystems, real: realSystems });

  // Role framing differs — each lens foregrounds its own responsibility.
  ok(built.risk.sections.some((s) => /risk register|exposure|risk posture/i.test(s.title)), "Chief Risk Officer foregrounds exposure + the risk register");
  ok(built.ciso.sections.some((s) => /threat|blocked|violation/i.test(s.title)), "CISO foregrounds security (threats / blocked / violations)");
  ok(built.compliance.sections.some((s) => /posture|audit|evidence|maturity/i.test(s.title)), "Compliance foregrounds regulatory posture + audit readiness");
  ok(built.legal.sections.some((s) => /decision|attestation|policy version|approval chain/i.test(s.title)), "Legal foregrounds decision history + attestations");
  ok(built.cto.sections.some((s) => /runtime|estate|topology/i.test(s.title)), "CTO foregrounds runtime + estate + topology");

  // Evidence packs (one source) appear in every lens that needs them.
  const packInCiso = JSON.stringify(built.ciso).includes("Evidence pack");
  const packInLegal = JSON.stringify(built.legal).includes("Evidence pack") || JSON.stringify(built.legal).includes("Attestation");
  const packInCompliance = JSON.stringify(built.compliance).includes("signed");
  ok(packInCiso && packInLegal && packInCompliance, "the ONE evidence pack is reused across CISO / Compliance / Legal lenses", { packInCiso, packInLegal, packInCompliance });

  // ── 3. Pure projection — rendering workspaces creates no new state ─────────
  const before = dataFiles();
  for (const r of roles) await ops.workspaces.workspace(r.id, org);
  const after = dataFiles();
  ok([...after].every((f) => before.has(f)), "rendering workspaces creates NO new tables/collections (pure projection)", { new: [...after].filter((f) => !before.has(f)) });

  // ── 4. Honesty — un-instrumented metrics are notes, never fabrications ─────
  const cfoSpend = built.cfo.sections.find((s) => s.key === "spend");
  ok(cfoSpend && cfoSpend.kind === "note" && cfoSpend.available === false && /source/i.test(cfoSpend.reason), "CFO AI-spend is an explicit not-instrumented note, not a fabricated figure");
  const ceoRevenue = built.ceo.sections.find((s) => s.key === "revenue");
  ok(ceoRevenue && ceoRevenue.available === false, "CEO revenue-at-risk is honestly marked (no invented currency)");
  // The derived ROI figure IS grounded (a real evidence-block count).
  const roi = built.cfo.sections.find((s) => s.key === "roi");
  ok(roi && roi.items.some((i) => /incidents prevented/i.test(i.label) && typeof i.value === "number"), "CFO governance ROI is grounded in real evidence counts");

  // ── 5. Extensibility + isolation ──────────────────────────────────────────
  ok((await ops.workspaces.workspace("does_not_exist", org)) === null, "an unknown role returns null (role set is closed + data-driven)");
  ok((await ops.workspaces.workspace("ceo", null)).error === "no enterprise", "a workspace without an enterprise degrades gracefully");

  console.log(`\n${pass}/${pass + fail} passed`);
  srv.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });
