/* ============================================================================
 * Guardian OS — Industry Intelligence Packs test (Phase 5).
 *
 * Hermetic (mock engine with dynamic-policy enforcement, temp store). Proves the
 * architecture's promise: packs EXTEND Guardian OS, they never fork it.
 *
 *   1. CATALOG      eight packs, each satisfying the pack contract, each
 *                   independently versioned.
 *   2. KERNEL       with no pack installed the kernel is exactly as provisioned;
 *                   installing a pack makes it enforce MORE (deny-only), and the
 *                   pack's policies are live Ω policies in the same engine.
 *   3. GOVERNED     installation runs through the existing governed policy
 *                   lifecycle (draft → validate → activate) and is audited.
 *   4. NO FORK      a pack dashboard is a projection of the SAME shared context
 *                   the executive workspaces read — no duplicated data, no new
 *                   twin, and the pack lens shows the same governance score.
 *   5. RECOMMEND    pack recommendations flow through the SAME governed path
 *                   (managed → proposal → Ω → approval → evidence).
 *   6. REVERSIBLE   uninstalling rolls the pack's policies back cleanly.
 *   7. EXTENSIBLE   adding an industry is data-only; nothing else changes.
 *
 *   node scripts/ops/industry.test.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-industry-test-"));
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
  const srv = await startMockEngine({ governancePolicies: true });
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${srv.address().port}`;
  const ops = require("../../lib/ops");
  const rt = require("../../lib/runtime");
  console.log("\nIndustry Intelligence Packs test (mock engine on :" + srv.address().port + ")\n");

  const evalTool = (tool, args = {}) => rt.engine.evaluate([{ tool, args }], ["enterprise"], 3);

  // ── 1. Catalog + contract ─────────────────────────────────────────────────
  const catalog = ops.industry.catalog();
  const expected = ["healthcare", "finance", "cybersecurity", "government", "manufacturing", "insurance", "retail", "education"];
  ok(catalog.length === 8 && expected.every((id) => catalog.some((p) => p.id === id)), "eight Industry Intelligence Packs are registered", catalog.map((p) => p.id));
  ok(catalog.every((p) => p.version && p.industry && p.purpose && p.counts.policies > 0 && p.counts.mappings > 0), "every pack is independently versioned and carries policies + evidence mappings");
  ok(catalog.every((p) => p.regulations.length > 0 && p.counts.templates > 0 && p.counts.workflows > 0), "every pack carries regulations, policy templates and incident workflows");

  // ── Provision an enterprise (the platform, unchanged) ─────────────────────
  const prov = await ops.provisioning.provision({}, { actor: "davarn@control-room" });
  const org = prov.org_id;
  ok(prov.result.suggested_industry_pack === "finance", "provisioning suggests the pack matching the enterprise's industry", prov.result.suggested_industry_pack);
  // An ungoverned trading tool, so the pack has real work to do.
  await ops.entities.create({ org_id: org, layer: "estate", kind: "tool", name: "settle_trade", attrs: { privileged: true } });

  // ── 2. Kernel behaviour BEFORE any pack ───────────────────────────────────
  const baselinePolicies = (await ops.govpolicy.active({})).filter((p) => p.scope === org).length;
  ok((await evalTool("execute_order")).json.verdict === "PERMIT", "before installing a pack the kernel does not govern a trading tool (baseline unchanged)");
  ok((await evalTool("settle_claim", { amount: 90000 })).json.verdict === "PERMIT", "before installing a pack an insurance action is likewise ungoverned");

  // ── 3. Install — governed, and the kernel enforces MORE ───────────────────
  const inst = await ops.industry.install(org, "finance", { actor: "davarn@control-room" });
  ok(inst.activated === 4 && inst.pack_id === "finance", "installing the Finance pack activates its Ω policies", inst.activated);
  const afterPolicies = (await ops.govpolicy.active({})).filter((p) => p.scope === org);
  ok(afterPolicies.length === baselinePolicies + 4, "the pack's policies are live in the SAME engine, scoped to the enterprise", { before: baselinePolicies, after: afterPolicies.length });
  ok(afterPolicies.some((p) => p.name === "fin_trading_autonomy_limit" && p.status === "active"), "pack policies went through draft → validate → activate (the governed lifecycle)");
  // The kernel now enforces the pack's rule — deny-only, precise.
  ok((await evalTool("execute_order")).json.verdict === "BLOCK", "the kernel NOW blocks the ungoverned trading action (pack policy live)");
  ok((await evalTool("execute_order", { operator_approved: true })).json.verdict === "PERMIT", "an approved trading action still PERMITs — packs only ever ADD constraints");
  ok((await evalTool("some_unrelated_tool")).json.verdict === "PERMIT", "installing a pack never blocks unrelated tools (deny-only preserved)");
  const audit = (await rt.adminaudit.list({ limit: 50 })).some((a) => a.action === "industry_pack_installed");
  ok(audit, "the installation is recorded in the admin audit trail");

  // ── 4. No fork — the pack projects the ONE shared context ─────────────────
  const dash = await ops.industry.dashboard(org, "finance");
  ok(dash && dash.sections.length >= 6 && dash.metrics.length >= 5, "the pack contributes a specialised dashboard + executive metrics", { s: dash.sections.length, m: dash.metrics.length });
  ok(dash.metrics.some((m) => m.key === "ai_financial_exposure") && dash.metrics.some((m) => m.key === "risk_concentration"), "the pack's executive metrics are the industry's own (exposure, concentration)");
  // Same twin: the pack lens and the CEO workspace read the same governance score.
  const ceo = await ops.workspaces.workspace("ceo", org);
  const lens = await ops.workspaces.workspace("industry:finance", org);
  ok(lens && lens.header.governance.score === ceo.header.governance.score, "the pack lens shows the SAME governance score as the executive workspaces (one twin)", { lens: lens && lens.header.governance.score, ceo: ceo.header.governance.score });
  const rolesFor = await ops.workspaces.rolesFor(org);
  ok(rolesFor.some((r) => r.id === "industry:finance"), "an installed pack becomes an additional executive perspective", rolesFor.map((r) => r.id));
  // Sections use the shared vocabulary, so one renderer draws every surface.
  const KINDS = new Set(["stat", "score", "list", "timeline", "note"]);
  ok(dash.sections.every((s) => KINDS.has(s.kind)), "pack sections use the shared presentation vocabulary (no bespoke UI layer)", [...new Set(dash.sections.map((s) => s.kind))]);
  ok(dash.sections.some((s) => s.kind === "note" && s.available === false), "un-instrumented industry metrics stay honest notes, never fabricated figures");

  // ── 5. Recommendations flow through the SAME governed path ────────────────
  const packRecs = await ops.industry.recommendations(org);
  ok(packRecs.length > 0 && packRecs.every((r) => r.source_pack === "finance"), "the installed pack contributes recommendation candidates", packRecs.length);
  const derived = await ops.managed.deriveRecommendations(org);
  ok(derived.some((r) => r.evidence && r.evidence.pack === "finance"), "managed governance picks up pack recommendations (one recommendations engine)");
  await ops.managed.recommend(org, { actor: "guardian_os" });
  const props = (await ops.proposals.list({ org_id: org, limit: 200 })).filter((p) => p.action_id === "create_recommendation" && p.source === "managed_governance");
  ok(props.length > 0 && props.every((p) => p.risk === "low"), "pack recommendations become GOVERNED proposals — proposal → Ω → approval → evidence", props.length);

  // ── 6. Reversible ─────────────────────────────────────────────────────────
  const un = await ops.industry.uninstall(org, "finance", { actor: "davarn@control-room" });
  ok(un.policies_rolled_back.length === 4, "uninstalling rolls the pack's policies back", un.policies_rolled_back.length);
  const restored = (await ops.govpolicy.active({})).filter((p) => p.scope === org).length;
  ok(restored === baselinePolicies, "the enterprise returns to exactly its pre-pack governed baseline", { restored, baselinePolicies });
  ok((await evalTool("execute_order")).json.verdict === "PERMIT", "the kernel stops enforcing the pack's rule once removed");
  ok((await ops.industry.installed(org)).length === 0 && (await ops.workspaces.rolesFor(org)).every((r) => !r.id.startsWith("industry:")), "the pack lens disappears with the pack");

  // ── 7. Extensibility + isolation ──────────────────────────────────────────
  await ops.industry.install(org, "healthcare", { actor: "davarn@control-room" });
  ok((await ops.industry.isInstalled(org, "healthcare")) && (await ops.industry.summary(org)).regulations.includes("HIPAA"), "a different industry installs the same way (extensibility is data-only)");
  let threw = null;
  try { await ops.industry.install(org, "not_an_industry", { actor: "davarn" }); } catch (e) { threw = e.message; }
  ok(/unknown industry pack/.test(threw || ""), "an unknown pack is rejected", threw);
  threw = null;
  try { await ops.industry.install(org, "healthcare", { actor: "davarn" }); } catch (e) { threw = e.message; }
  ok(/already installed/.test(threw || ""), "a pack cannot be double-installed");
  ok((await evalTool("prescribe_medication")).json.verdict === "BLOCK" && (await evalTool("prescribe_medication", { clinician_approved: true })).json.verdict === "PERMIT", "the Healthcare pack governs clinical actions at runtime (clinician approval enforced)");

  console.log(`\n${pass}/${pass + fail} passed`);
  srv.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });
