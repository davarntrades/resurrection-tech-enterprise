/* ============================================================================
 * Guardian OS — Enterprise Provisioning test ("the OS installation").
 *
 * Hermetic (mock engine with dynamic-policy enforcement, temp store). Proves one
 * provision() call stands up a COMPLETE governed runtime across all seven phases:
 *
 *   1. IDENTITY + ESTATE + TRUST — org + entities created, relationships mapped.
 *   2. RUNTIME GOVERNANCE — Ω policies generated through the dynamic policy engine
 *      (draft → validate → activate), and the kernel actually ENFORCES them
 *      afterwards (a privileged tool is blocked).
 *   3. DEPARTMENTS — enabled and recorded.
 *   4. DIGITAL TWIN — the six enterprise graphs generated immediately.
 *   5. EXECUTIVE COMMAND — never empty: health, AI systems, governance, approvals,
 *      risks, departments, twin, recommended actions, all populated (seeded).
 *   6. GUARANTEES PRESERVED — generated policies are deny-only; the kernel is
 *      only ever MORE constrained after provisioning.
 *
 *   node scripts/ops/provisioning.test.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-provision-test-"));
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
  console.log("\nEnterprise Provisioning test (mock engine on :" + srv.address().port + ")\n");

  // wire_transfer is governed ONLY by the provisioned policies (no static rule),
  // so it cleanly demonstrates runtime enforcement of what provisioning installed.
  const wire = (amount, approved) => rt.engine.evaluate([{ tool: "wire_transfer", args: { amount, ...(approved ? { operator_approved: true } : {}) } }], ["enterprise"], 3);

  // ── Install the example enterprise ────────────────────────────────────────
  const r = await ops.provisioning.provision({}, { actor: "davarn@control-room" });
  ok(r.status === "complete" && r.org_id, "provision() completes and creates the enterprise org", r.status);
  const org_id = r.org_id;

  // ── 1. Identity + estate + trust ──────────────────────────────────────────
  const es = await ops.entities.summary(org_id);
  ok(es.by_layer.identity >= 1 && es.by_layer.estate >= 1 && es.by_layer.trust >= 1, "all three estate layers created (identity/estate/trust)", es.by_layer);
  const agents = await ops.entities.forOrg(org_id, { kind: "agent" });
  ok(agents.length >= 1 && agents.every((a) => Array.isArray(a.refs)), "agents created with mapped relationships (refs)", agents.length);
  const sys = (await ops.entities.forOrg(org_id, { kind: "ai_system" }))[0];
  ok(sys && sys.refs.length >= 1, "AI systems reference their agents/APIs/environment (auto-mapped)", sys && sys.refs.length);

  // ── 2. Runtime governance via the dynamic policy engine ───────────────────
  ok(r.result.governance.active > 0 && r.result.governance.fail_closed === true, "Phase 4 generated + activated fail-closed Ω policies via govpolicy", r.result.governance);
  const activated = (await ops.govpolicy.active({})).filter((p) => p.scope === org_id);
  ok(activated.length > 0 && activated.every((p) => p.status === "active"), "the enterprise's policies are active in the kernel, scoped to the org", activated.length);
  // The kernel now ENFORCES a provisioned policy at runtime.
  ok((await wire(25000, false)).json.verdict === "BLOCK", "kernel now BLOCKS an unapproved privileged wire transfer (provisioned policy live)");
  ok((await wire(5000, true)).json.verdict === "PERMIT", "an operator-approved wire transfer under the limit PERMITs (deny-only, precise)");

  // ── 3. Departments ────────────────────────────────────────────────────────
  ok(r.result.departments.enabled >= 5, "Guardian OS departments enabled", r.result.departments.enabled);

  // ── 4. Digital twin — six graphs generated immediately ────────────────────
  const graph = await ops.entgraph.build(org_id);
  const facets = Object.keys(graph.facets);
  ok(JSON.stringify(facets.sort()) === JSON.stringify(["asset", "dependency", "enterprise", "risk", "runtime", "trust"]), "all six enterprise digital-twin graphs generated", facets);
  ok(graph.facets.dependency.edges.length > 0, "the dependency graph has real relationships");

  // ── 5. Executive Command — never an empty dashboard ───────────────────────
  const cmd = await ops.provisioning.command(org_id);
  ok(!!cmd.health && cmd.ai_systems.systems > 0 && cmd.governance.active_policies > 0, "command shows health + AI systems + governance");
  ok(cmd.open_approvals.length >= 1 && cmd.risks.open_incidents >= 1, "command is pre-seeded — open approvals + risks present (never empty)", { a: cmd.open_approvals.length, r: cmd.risks.open_incidents });
  ok(cmd.departments.length >= 5 && cmd.twin && cmd.recommended_actions.length >= 1, "command shows departments, twin facets, and recommended actions");

  // ── 6. Deny-only invariant preserved ──────────────────────────────────────
  ok((await rt.engine.evaluate([{ tool: "some_unrelated_tool", args: {} }], ["enterprise"], 3)).json.verdict === "PERMIT", "provisioning never blocks unrelated tools (baseline only ever more constrained)");

  // ── Idempotent read surfaces ──────────────────────────────────────────────
  ok((await ops.provisioning.forOrg(org_id)).status === "complete" && (await ops.provisioning.list()).length >= 1, "the provisioning run is recorded + listable");

  console.log(`\n${pass}/${pass + fail} passed`);
  srv.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });
