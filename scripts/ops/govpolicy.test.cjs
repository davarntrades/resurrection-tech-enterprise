/* ============================================================================
 * Guardian OS — Dynamic Runtime Governance Policy test.
 *
 * Hermetic (mock engine with dynamic-policy enforcement, temp store). Proves the
 * kernel loads customer Ω policies AT RUNTIME with every guarantee intact:
 *
 *   1. RUNTIME LOAD — before activation a matching action PERMITs; after
 *      governed activation the SAME action is BLOCKED by the engine; after
 *      rollback it PERMITs again — no code change, no redeploy.
 *   2. GOVERNED ACTIVATION — activating a policy is a privileged action: a bare
 *      proposal is BLOCKED by Ω (ops_unauthorized_policy_activation) and
 *      escalates; only an operator approval executes it. The agent never
 *      activates policy (not in any charter).
 *   3. VALIDATED BEFORE ACTIVATION — a malformed / over-reaching / draft policy
 *      cannot be activated.
 *   4. VERSIONED + ROLLBACK — a new version supersedes the prior active one;
 *      rollback re-activates a prior version or deactivates entirely (always
 *      allowed — the safety brake).
 *   5. DENY-BY-DEFAULT PRESERVED — a policy is deny-only; it can only turn a
 *      PERMIT into a BLOCK, never the reverse.
 *
 *   node scripts/ops/govpolicy.test.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-govpolicy-test-"));
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
  const { govpolicy } = ops;
  console.log("\nDynamic Runtime Governance Policy test (mock engine on :" + srv.address().port + ")\n");

  const DOMAINS = ["enterprise"];
  const wire = (amount) => rt.engine.evaluate([{ tool: "wire_transfer", args: { amount } }], DOMAINS, 3);
  const verdict = async (amount) => { const r = await wire(amount); return r.ok && r.json ? r.json.verdict : `ERR(${r.error || r.status})`; };

  const specV1 = { match: { tools: ["wire_transfer"] }, conditions: { threshold: { field: "amount", op: ">", value: 10000 } }, severity: "critical" };

  // ── 1. Validation gate + draft ────────────────────────────────────────────
  ok((() => { try { govpolicy.validateSpec({ name: "x", domain: "enterprise", match: { tools: [] } }); return false; } catch { return true; } })(), "validation rejects a policy with no tools");
  ok((() => { try { govpolicy.validateSpec({ name: "x", domain: "nope", match: { tools: ["t"] } }); return false; } catch { return true; } })(), "validation rejects an unknown Ω domain");
  const d1 = await govpolicy.draft({ name: "wire_limit", domain: "enterprise", spec: specV1, created_by: "op" });
  ok(d1.status === "draft" && d1.version === 1 && d1.hash, "policy drafted (v1, hash recorded)", d1.status);

  // A draft cannot be activated — must be validated first.
  ok(await (async () => { try { await govpolicy.activate(d1.id, { actor: "op" }); return false; } catch { return true; } })(), "a draft cannot be activated (validate first)");
  const v1 = await govpolicy.validate(d1.id, { actor: "op" });
  ok(v1.status === "validated", "policy validated", v1.status);

  // ── 2. Before activation the kernel PERMITs the matching action ───────────
  ok((await verdict(25000)) === "PERMIT", "before activation: wire 25000 PERMITs (policy not live)");

  // ── 3. Governed activation: bare proposal is BLOCKED → escalates ──────────
  const bare = await ops.proposals.propose({ action_id: "activate_governance_policy", params: { policy_id: d1.id, actor: "op" } });
  ok(bare.status === "escalated" && bare.decision.rule === "ops_unauthorized_policy_activation", "un-approved activation is blocked by Ω → escalates", { s: bare.status, r: bare.decision && bare.decision.rule });
  ok((await govpolicy.get(d1.id)).status === "validated", "policy did NOT activate on the un-approved attempt", true);
  const approved = await ops.proposals.approve(bare.id, { actor: "davarn@control-room" });
  ok(approved.status === "executed", "operator approval activates the policy through Runtime Governance", approved.status);
  ok((await govpolicy.get(d1.id)).status === "active", "policy is now active in the kernel", true);

  // ── 4. Runtime enforcement: SAME action now BLOCKED, no redeploy ──────────
  ok((await verdict(25000)) === "BLOCK", "after activation: wire 25000 is BLOCKED by the runtime-loaded policy");
  ok((await verdict(5000)) === "PERMIT", "wire 5000 still PERMITs (under the limit — deny-only, precise)");

  // ── 5. Versioning: v2 supersedes v1 ───────────────────────────────────────
  const d2 = await govpolicy.draft({ name: "wire_limit", domain: "enterprise", spec: { match: { tools: ["wire_transfer"] }, conditions: { threshold: { field: "amount", op: ">", value: 5000 } }, severity: "critical" }, created_by: "op" });
  await govpolicy.validate(d2.id, { actor: "op" });
  const a2 = await ops.proposals.approve((await ops.proposals.propose({ action_id: "activate_governance_policy", params: { policy_id: d2.id, actor: "op" } })).id, { actor: "op" });
  ok(a2.status === "executed" && (await govpolicy.get(d2.id)).status === "active" && (await govpolicy.get(d1.id)).status === "superseded", "activating v2 supersedes v1", true);
  ok((await verdict(6000)) === "BLOCK", "v2 (limit 5000) now blocks wire 6000");

  // ── 6. Rollback to a prior version (always allowed — the safety brake) ─────
  await govpolicy.rollback({ name: "wire_limit", scope: "global", to_version: 1, actor: "op" });
  ok((await govpolicy.get(d2.id)).status === "rolled_back" && (await govpolicy.get(d1.id)).status === "active", "rollback re-activates v1, retires v2", true);
  ok((await verdict(6000)) === "PERMIT" && (await verdict(25000)) === "BLOCK", "after rollback the kernel enforces v1's limit again", true);

  // ── 7. Rollback to nothing removes the constraint (back to baseline) ──────
  await govpolicy.rollback({ name: "wire_limit", scope: "global", actor: "op" });
  ok((await govpolicy.active()).length === 0 && (await verdict(25000)) === "PERMIT", "deactivating rollback returns the kernel to baseline (nothing blocked)", true);

  // ── 8. Deny-only invariant: a policy can never grant an allow ─────────────
  ok(govpolicy.evaluateSpec(specV1, { tool: "unrelated_tool", amount: 999999 }) === false, "a policy never fires on an unrelated tool (no over-reach)");
  ok(govpolicy.evaluateSpec({ match: { tools: ["x"] } }, { tool: "x" }) === true && govpolicy.evaluateSpec({ match: { tools: ["x"] } }, { tool: "y" }) === false, "deny-only: bare tool match blocks that tool, nothing else");

  console.log(`\n${pass}/${pass + fail} passed`);
  srv.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });
