/* ============================================================================
 * Guardian OS Sovereign — acceptance-suite + assurance-artefact test.
 *
 * The acceptance suite is the instrument a customer runs on THEIR hardware. It
 * has to be trustworthy before it is useful, so this proves:
 *
 *   1. RUNS         every step executes and is timed on this host.
 *   2. ENFORCES     the core claim is actually tested — an unauthorised action
 *                   must come back BLOCK/ESCALATE, and the suite FAILS if the
 *                   deployment merely allows it.
 *   3. DETECTS      when the engine is gone, the suite fails rather than
 *                   quietly passing. An acceptance test that cannot fail is
 *                   worthless.
 *   4. HONEST       with no site and no witness recorded, the run is marked as
 *                   a self-test, and the attestation says so on its face.
 *   5. CLEANS UP    the acceptance enterprise is removed; existing enterprises
 *                   are untouched.
 *   6. ASSURANCE    the control mapping leads with its gaps and never claims an
 *                   accreditation Guardian OS does not hold.
 *
 *   node scripts/sovereign/acceptance.test.cjs
 * ========================================================================== */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "gos-accept-"));
process.env.RUNTIME_DATA_DIR = path.join(TMP, "data");
process.env.GUARDIAN_TRUST_DIR = path.join(TMP, "trust");
fs.mkdirSync(process.env.GUARDIAN_TRUST_DIR, { recursive: true });
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.GUARDIAN_PROFILE;

const { startMockEngine } = require("../ops/mock-engine.cjs");

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); }
}

async function main() {
  const srv = await startMockEngine({ governancePolicies: true });
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${srv.address().port}`;

  const sovereign = require("../../lib/sovereign");
  const rt = require("../../lib/runtime");
  const ops = require("../../lib/ops");
  console.log(`\nSite acceptance + assurance test (mock engine on :${srv.address().port})\n`);

  // A pre-existing enterprise the suite must not disturb.
  const existing = await ops.provisioning.provision({ name: "Pre-existing enterprise" }, { actor: "setup" });
  const existingOrg = existing.org_id;

  // ── 1-2. It runs, and it tests the core claim ─────────────────────────────
  const a = await sovereign.acceptance.run({ operator: "test-operator" });
  const byId = Object.fromEntries(a.steps.map((s) => [s.id, s]));
  ok(a.steps.length >= 9, "every acceptance step executed", a.steps.length);
  ok(a.steps.every((s) => typeof s.ms === "number"), "each step is timed on this host");
  ok(byId.enforce && byId.enforce.status === "pass" && ["BLOCK", "ESCALATE"].includes(byId.enforce.verdict),
    "the core claim is tested: an unauthorised action is BLOCKED on this hardware", byId.enforce && byId.enforce.detail);
  ok(typeof a.performance.governance_decision_ms === "number",
    "the governance decision is MEASURED on this hardware, not assumed", a.performance.governance_decision_ms);
  ok(byId.chain && byId.chain.status !== "fail", "the decision hash chain verifies", byId.chain && byId.chain.detail);
  ok(byId.render && byId.render.status === "pass" && /no Chromium/.test(byId.render.detail),
    "an evidence pack renders to PDF on the target with no browser", byId.render && byId.render.detail);
  ok(a.host.platform && a.host.cpus > 0, "the host is recorded on the run", a.host);
  ok(a.ok, "a healthy deployment is ACCEPTED", a.summary);

  // ── 3. It can actually fail ───────────────────────────────────────────────
  // The engine URL is frozen at module load, so isolation is simulated by
  // taking the engine AWAY — which is also the failure an operator actually
  // hits (the service is down, not misconfigured).
  await new Promise((r) => srv.close(r));
  const dead = await sovereign.acceptance.run({ operator: "test-operator" });
  const deadById = Object.fromEntries(dead.steps.map((s) => [s.id, s]));
  ok(!dead.ok, "with the engine gone the suite FAILS (an acceptance test that cannot fail is worthless)", dead.summary);
  ok(deadById.engine.status === "fail" && /fail-closed/.test(deadById.engine.detail),
    "it names the fail-closed consequence rather than reporting a bare error", deadById.engine.detail);
  ok(deadById.enforce.status === "fail", "the enforcement step fails when nothing can enforce");

  // ── 4. Honesty about what a run means ─────────────────────────────────────
  ok(a.field_trial === false, "a run with no site and no witness is NOT marked a field trial");
  const selfDoc = sovereign.acceptance.document(a);
  ok(/NO SITE OR WITNESS WAS RECORDED/.test(selfDoc.subtitle) && selfDoc.blocks.some((b) => b.kind === "note"),
    "the attestation states on its face that it is a self-test");
  const fieldRun = { ...a, site: "Site B, rack 4", witness: "A. Witness", field_trial: true };
  const fieldDoc = sovereign.acceptance.document(fieldRun);
  ok(!/NO SITE OR WITNESS/.test(fieldDoc.subtitle) && /observed by the named witness/.test(fieldDoc.subtitle),
    "with a site and a witness recorded it reads as a witnessed run");
  ok(fieldDoc.blocks.some((b) => b.kind === "text" && /not.*accreditation|no.*accreditation|neither signature constitutes/i.test(b.text)),
    "even a witnessed record refuses to imply accreditation");
  const rendered = sovereign.report.render(fieldDoc);
  ok(Buffer.from(rendered.bytes).subarray(0, 5).toString("latin1") === "%PDF-", "the acceptance record renders to PDF");

  // ── 5. Cleanup + isolation ────────────────────────────────────────────────
  ok(byId.cleanup && byId.cleanup.status === "pass", "the acceptance enterprise is removed", byId.cleanup && byId.cleanup.detail);
  ok(!(await rt.store.findOptional("orgs", { id: byId.provision.org_id })).length,
    "the acceptance enterprise is gone from the store");
  ok((await rt.store.findOptional("orgs", { id: existingOrg })).length === 1,
    "a pre-existing enterprise is untouched by the acceptance run");

  // ── 6. Assurance artefacts ────────────────────────────────────────────────
  const controls = sovereign.controls;
  const all = controls.assessAll();
  ok(all.frameworks.length === 4, "four frameworks are mapped", all.frameworks.map((f) => f.framework));
  ok(/no third-party accreditation/i.test(all.disclaimer) && /not a certification/i.test(all.disclaimer),
    "the disclaimer refuses to imply accreditation");
  const gaps = controls.gapRegister();
  ok(gaps.length > 0, "the gap register is non-empty — gaps are published, not hidden", gaps.length);
  ok(gaps.every((g) => g.limitation && g.limitation.length > 30),
    "every gap states a specific limitation, not a placeholder");
  ok(controls.assess("nist-800-53r5").by_status.partial > 0,
    "partial controls are recorded as partial rather than rounded up to implemented");
  const cdoc = controls.document();
  ok(cdoc.blocks[2].text === "Gap register" || cdoc.blocks.findIndex((b) => b.text === "Gap register") < cdoc.blocks.findIndex((b) => b.text === "NIST SP 800-53 Rev 5"),
    "the gap register comes BEFORE the satisfied controls — an assessor reads it first");
  ok(cdoc.meta.some((m) => m.label === "Accreditation held" && m.value === "none"),
    "the cover states plainly that no accreditation is held");
  ok(Buffer.from(sovereign.report.render(cdoc).bytes).subarray(0, 5).toString("latin1") === "%PDF-",
    "the control mapping renders to PDF");

  console.log(`\n${pass}/${pass + fail} passed`);
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });
