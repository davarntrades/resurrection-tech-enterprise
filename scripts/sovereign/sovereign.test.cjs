/* ============================================================================
 * Guardian OS Sovereign — platform test (Phase 6).
 *
 * Hermetic (mock engine, temp store, temp trust store). Proves the sovereign
 * deployment model without touching the Runtime Governance kernel:
 *
 *   1. PROFILES      seven profiles resolve; an unknown one is REFUSED, never
 *                    silently defaulted to a connected deployment.
 *   2. EGRESS        under a local-storage profile the store refuses to build a
 *                    cloud client even with credentials present.
 *   3. BUNDLES       build → sign → verify; every tamper is caught; an unsigned
 *                    bundle is refused where the profile requires signing.
 *   4. OFFLINE PACKS a pack exports to media and installs from it, through the
 *                    SAME governed lifecycle, with no network.
 *   5. GENERIC MODE  a pack whose code is not in this build still installs and
 *                    ENFORCES; its projections degrade honestly, never silently.
 *   6. UPDATES       a signed update applies, records a rollback plan captured
 *                    BEFORE the first change, and rolls back cleanly. SQL
 *                    migrations are reported, never executed.
 *   7. IMMUTABLE     authoring is locked; a verified bundle is the only way in;
 *                    the rollback brake stays available by design.
 *   8. VERIFY        `guardian verify` reports the deployment honestly, and
 *                    FAILS when the policy bundle does not verify.
 *   9. LOCAL TWIN    executive workspaces + the AI twin project off the local
 *                    store with no cloud dependency.
 *
 *   node scripts/sovereign/sovereign.test.cjs
 * ========================================================================== */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "gos-sovereign-"));
process.env.RUNTIME_DATA_DIR = path.join(TMP, "data");
process.env.GUARDIAN_TRUST_DIR = path.join(TMP, "trust");
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.GUARDIAN_PROFILE;
delete process.env.GUARDIAN_IMMUTABLE;
fs.mkdirSync(process.env.GUARDIAN_TRUST_DIR, { recursive: true });

const { startMockEngine } = require("../ops/mock-engine.cjs");

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); }
}
async function throws(fn, re, name) {
  try { await fn(); ok(false, name, "did not throw"); }
  catch (e) { ok(re.test(e.message), name, e.message); }
}
const withProfile = async (id, fn) => {
  const prev = process.env.GUARDIAN_PROFILE;
  process.env.GUARDIAN_PROFILE = id;
  try { return await fn(); } finally { if (prev === undefined) delete process.env.GUARDIAN_PROFILE; else process.env.GUARDIAN_PROFILE = prev; }
};

async function main() {
  const srv = await startMockEngine({ governancePolicies: true });
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${srv.address().port}`;

  const sovereign = require("../../lib/sovereign");
  const { profiles, bundle, packs: sovPacks, updates, immutable } = sovereign;
  const ops = require("../../lib/ops");
  const rt = require("../../lib/runtime");

  console.log(`\nGuardian OS Sovereign test (mock engine on :${srv.address().port})\n`);

  // ── 1. Profiles ───────────────────────────────────────────────────────────
  ok(profiles.PROFILE_IDS.length === 7 && ["cloud", "hybrid", "private_cloud", "sovereign_private", "on_prem", "sovereign", "air_gapped"].every((p) => profiles.PROFILE_IDS.includes(p)),
    "seven deployment profiles are offered", profiles.PROFILE_IDS);
  ok(profiles.profile().id === "cloud", "the DEFAULT profile is cloud — existing deployments are unchanged", profiles.profile().id);
  ok(profiles.normalise("Air-Gapped") === "air_gapped" && profiles.profile("Air Gapped").id === "air_gapped", "profile names normalise (Air-Gapped / air gapped / AIR_GAPPED)");
  try { profiles.profile("sovereignish"); ok(false, "an unknown profile is REFUSED, never silently defaulted"); }
  catch (e) { ok(/unknown deployment profile/.test(e.message), "an unknown profile is REFUSED, never silently defaulted", e.message); }
  ok(!profiles.allowsEgress("air_gapped") && !profiles.allowsCloudStore("sovereign") && profiles.usesPolicyBundle("on_prem"),
    "capability predicates match the profile matrix");
  ok(profiles.immutable("sovereign") && profiles.immutable("air_gapped") && !profiles.immutable("cloud"),
    "sovereign + air-gapped are immutable by default; cloud is not");
  await withProfile("sovereign", () => {
    process.env.GUARDIAN_IMMUTABLE = "0";
    const stillLocked = profiles.immutable();
    delete process.env.GUARDIAN_IMMUTABLE;
    ok(stillLocked, "GUARDIAN_IMMUTABLE=0 cannot unlock a profile that mandates immutability");
  });

  // ── 2. Egress lockdown ────────────────────────────────────────────────────
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://must-never-be-used.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-that-must-not-be-used";
  await withProfile("air_gapped", async () => {
    rt.store.resetBackend();
    ok(rt.store.backend() === "file", "an air-gapped profile REFUSES a cloud store even with credentials present", rt.store.backend());
    ok(rt.store.cloudRefused() === true, "the refusal is reported, not silent");
  });
  await withProfile("cloud", async () => {
    rt.store.resetBackend();
    ok(rt.store.backend() === "supabase", "the same credentials DO build a cloud client under the cloud profile",
      { backend: rt.store.backend(), error: rt.store.cloudError() });
  });
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  rt.store.resetBackend();
  ok(rt.store.backend() === "file", "back to the local store for the rest of the suite");

  // ── 3. Bundle format ──────────────────────────────────────────────────────
  const key = bundle.keygen({ key_id: "sovereign-test" });
  fs.writeFileSync(path.join(process.env.GUARDIAN_TRUST_DIR, `${key.key_id}.pub`), `${key.public_key}\n`);
  const signing = { alg: "ed25519", key_id: key.key_id, private_key_pem: key.private_key_pem };

  const POLICY = { name: "sov_test_wire_cap", domain: "finance", status: "active", version: 1,
    spec: { match: { tools: ["wire_transfer"] }, conditions: { threshold: { field: "amount", op: ">", value: 10000 } }, severity: "critical" } };
  const built = bundle.build({ kind: "policies", id: "sov-test", version: "1.0.0", files: { "policies/a.json": JSON.stringify(POLICY) }, sign: signing });
  let report = bundle.verify(built, { requireSignature: true });
  ok(report.ok && report.alg === "ed25519", "a signed bundle verifies against the trust store", report.errors);

  const tampered = { manifest: built.manifest, files: { "policies/a.json": Buffer.from(JSON.stringify({ ...POLICY, spec: { ...POLICY.spec, conditions: { threshold: { field: "amount", op: ">", value: 1e9 } } } })) } };
  ok(!bundle.verify(tampered).ok, "a tampered entry is rejected");
  const relisted = { manifest: { ...built.manifest, entries: [] }, files: built.files };
  ok(!bundle.verify(relisted).ok, "rewriting the entry list is rejected");
  const extra = { manifest: built.manifest, files: { ...built.files, "policies/smuggled.json": Buffer.from("{}") } };
  ok(bundle.verify(extra).errors.some((e) => /unlisted file/.test(e)), "an unlisted extra file is rejected");
  const unsigned = bundle.build({ kind: "policies", id: "sov-test", version: "1.0.0", files: { "policies/a.json": JSON.stringify(POLICY) }, sign: null });
  ok(!bundle.verify(unsigned, { requireSignature: true }).ok && bundle.verify(unsigned, { requireSignature: false }).ok,
    "an unsigned bundle is refused where signing is required, accepted where it is not");
  try { bundle.build({ kind: "policies", id: "x", version: "1", files: { "../escape.json": "{}" }, sign: null }); ok(false, "a traversing entry path is refused at build time"); }
  catch (e) { ok(/must not traverse/.test(e.message), "a traversing entry path is refused at build time", e.message); }

  const dir = path.join(TMP, "policy-bundle");
  bundle.writeDir(built, dir);
  ok(bundle.verify(bundle.read(dir), { requireSignature: true }).ok, "a bundle round-trips through the DIRECTORY form");
  const gos = path.join(TMP, "sov-test.gos");
  bundle.writeFile(built, gos);
  ok(bundle.verify(bundle.read(gos), { requireSignature: true }).ok, "a bundle round-trips through the single-file .gos form");

  // ── 4. Offline pack export + install ──────────────────────────────────────
  const prov = await ops.provisioning.provision({ industry: "financial services" }, { actor: "davarn@control-room" });
  const org = prov.org_id;
  const packFile = path.join(TMP, "finance.pack");
  bundle.writeFile(sovPacks.exportPack("finance", { sign: signing }), packFile);
  ok(fs.existsSync(packFile), "an industry pack exports to signed media");
  const readBack = sovPacks.readPack(packFile, { requireSignature: true });
  ok(readBack.content.id === "finance" && readBack.content.policies.length > 0, "the exported pack carries its declarative Ω policies", readBack.content.policies.length);
  ok(readBack.content.metrics === undefined && readBack.content.dashboard === undefined,
    "a pack bundle carries DATA ONLY — no code travels on the media");
  const installed = await ops.industry.installFromBundle(org, packFile, { actor: "guardian-cli" });
  ok(installed.activated > 0, "installing from media activates the pack's Ω policies", installed.activated);
  ok(installed.source === "bundle" && installed.projections === "builtin", "the install records its provenance + projection mode", { source: installed.source, projections: installed.projections });
  const active = await ops.govpolicy.active({ scope: org });
  ok(active.some((p) => p.name.startsWith("fin_")), "the pack's policies are ACTIVE in the governed policy set", active.map((p) => p.name));

  // ── 5. Generic (declarative) projection mode ──────────────────────────────
  const futureContent = { ...sovPacks.declarative(require("../../lib/ops/packs").get("finance")), id: "energy", industry: "Energy", title: "Energy Intelligence Pack", purpose: "Grid + OT AI governance for energy operators.", version: "0.9.0" };
  const futureFile = path.join(TMP, "energy.pack");
  bundle.writeFile(bundle.build({ kind: "pack", id: "energy", version: "0.9.0", files: { "pack/energy.json": JSON.stringify(futureContent) }, sign: signing }), futureFile);
  ok(sovPacks.projectionMode("energy") === "generic", "a pack whose code is not in this build reports the generic projection mode");
  const future = await ops.industry.installFromBundle(org, futureFile, { actor: "guardian-cli" });
  ok(future.activated >= 0 && future.projections === "generic", "an unknown-to-this-build pack still installs from signed media", { activated: future.activated, projections: future.projections });
  const futureDash = await ops.industry.dashboard(org, "energy");
  ok(futureDash && futureDash.sections.length >= 5, "it renders a real dashboard from its declarative content", futureDash && futureDash.sections.length);
  ok(futureDash.sections.some((s) => s.kind === "note" && s.available === false && /projection code is not present/.test(s.reason)),
    "the missing bespoke analytics are an HONEST note, never a fabricated panel");
  ok((await ops.industry.templates(org)).some((t) => t.pack_id === "energy"), "its templates reach the policy-authoring surface like any other pack");

  // ── 6. Signed offline update, with rollback ───────────────────────────────
  const updateBundle = updates.buildUpdate({
    id: "guardian", version: "1.4.0",
    policies: [{ name: "sov_update_export_block", domain: "data_privacy", scope: "org",
      spec: { match: { tools: ["bulk_export"] }, conditions: { flag_true_blocks: ["destination_external"] }, severity: "critical" } }],
    packs: ["cybersecurity"],
    migrations: { "001_add_column.sql": "alter table public.rg_demo add column if not exists x text;\n" },
    notes: "# Guardian 1.4.0\n\nAdds an export guard and the Cybersecurity pack.\n",
    sign: signing,
  });
  const updateFile = path.join(TMP, "guardian-1.4.0.gos");
  bundle.writeFile(updateBundle, updateFile);
  const plan = updates.inspect(updateFile);
  ok(plan.policies.length === 1 && plan.packs.length === 1 && plan.migrations.length === 1,
    "inspect() describes exactly what an update would do, changing nothing", { p: plan.policies.length, k: plan.packs.length, m: plan.migrations.length });
  const applied = await updates.apply(updateFile, { org_id: org, actor: "guardian-cli" });
  ok(applied.status === "applied", "a signed update applies", applied.applied);
  ok(applied.rollback_plan.policies.length === 1 && applied.rollback_plan.packs.length === 1,
    "a rollback plan was captured BEFORE the first change", applied.rollback_plan);
  ok(applied.migrations.length === 1 && !/executed/i.test(String(applied.migrations_note || "")),
    "SQL migrations are REPORTED, never executed", applied.migrations_note);
  ok((await ops.govpolicy.active({ scope: org })).some((p) => p.name === "sov_update_export_block"), "the update's policy is enforcing");
  ok(await ops.industry.isInstalled(org, "cybersecurity"), "the update's pack is installed");
  const rolled = await updates.rollback(applied.id, { actor: "guardian-cli" });
  ok(rolled.status === "rolled_back", "the update rolls back");
  ok(!(await ops.govpolicy.active({ scope: org })).some((p) => p.name === "sov_update_export_block"), "its policy is no longer enforcing after rollback");
  ok(!(await ops.industry.isInstalled(org, "cybersecurity")), "its pack is no longer installed after rollback");
  ok((await updates.history({ org_id: org })).length === 1, "the update history survives the rollback (evidence, not erasure)");

  const rogue = bundle.keygen({ key_id: "rogue" });
  const rogueFile = path.join(TMP, "rogue.gos");
  bundle.writeFile(updates.buildUpdate({ id: "guardian", version: "9.9.9", policies: [{ name: "rogue_policy", domain: "finance", spec: { match: { tools: ["wire_transfer"] }, conditions: {} } }], sign: { alg: "ed25519", key_id: rogue.key_id, private_key_pem: rogue.private_key_pem } }), rogueFile);
  await withProfile("sovereign", () => throws(() => updates.apply(rogueFile, { org_id: org }), /failed verification|no trusted key/, "an update signed by an untrusted key is REFUSED"));

  // ── 7. Immutable runtime ──────────────────────────────────────────────────
  await withProfile("air_gapped", async () => {
    ok(immutable.locked(), "the runtime is locked under an air-gapped profile");
    await throws(() => ops.govpolicy.draft({ name: "adhoc", scope: org, domain: "finance", spec: { match: { tools: ["x"] }, conditions: {} } }),
      /immutable runtime/, "ad-hoc policy authoring is REFUSED on a locked runtime");
    await throws(() => ops.industry.install(org, "healthcare", { actor: "operator" }), /immutable runtime/, "ad-hoc pack installation is REFUSED on a locked runtime");
    const hcFile = path.join(TMP, "healthcare.pack");
    bundle.writeFile(sovPacks.exportPack("healthcare", { sign: signing }), hcFile);
    const res = await ops.industry.installFromBundle(org, hcFile, { actor: "guardian-cli" });
    ok(res.activated > 0, "a VERIFIED signed bundle installs on the same locked runtime", res.activated);
    ok(!immutable.inVerifiedBundle(), "the immutability window closes again after the install");
    const brake = await ops.industry.uninstall(org, "healthcare", { actor: "operator" });
    ok(brake.policies_rolled_back.length > 0, "rollback / uninstall stays available under immutability (the emergency brake)", brake.policies_rolled_back.length);
  });

  // ── 8. guardian verify ────────────────────────────────────────────────────
  await withProfile("air_gapped", async () => {
    process.env.GUARDIAN_POLICY_BUNDLE = dir;
    let v = await sovereign.verify.run({ org_id: org });
    const byId = Object.fromEntries(v.checks.map((c) => [c.id, c]));
    ok(byId.configuration.status === "pass", "verify: the deployment profile resolves", byId.configuration.detail);
    ok(byId.egress.status === "pass", "verify: no cloud client under an air-gapped profile", byId.egress.detail);
    ok(byId.policy_integrity.status === "pass", "verify: the policy bundle verifies", byId.policy_integrity.detail);
    ok(byId.trust_store.status === "pass", "verify: the trust store carries a signing key", byId.trust_store.detail);
    ok(byId.evidence_store.status === "pass", "verify: the local evidence store is writable", byId.evidence_store.detail);
    ok(byId.runtime_health.status === "pass", "verify: the Ω engine answers", byId.runtime_health.detail);
    ok(v.ok, "verify: a correctly-configured sovereign deployment passes", v.summary);
    const broken = path.join(TMP, "broken-bundle");
    fs.cpSync(dir, broken, { recursive: true });
    fs.appendFileSync(path.join(broken, "policies", "a.json"), " ");
    process.env.GUARDIAN_POLICY_BUNDLE = broken;
    v = await sovereign.verify.run({ org_id: org });
    const pi = v.checks.find((c) => c.id === "policy_integrity");
    ok(!v.ok && pi.status === "fail" && /FAILED verification/.test(pi.detail), "verify: a tampered policy bundle FAILS the deployment", pi.detail);
    delete process.env.GUARDIAN_POLICY_BUNDLE;
    v = await sovereign.verify.run({ org_id: org });
    ok(v.checks.find((c) => c.id === "policy_integrity").status === "fail",
      "verify: an offline profile with NO policy bundle configured fails (only the static baseline is enforcing)");
  });

  // ── 9. The local twin + workspaces work with no cloud ─────────────────────
  await ops.managed.monitor(org, { actor: "guardian_os" });
  const roles = ops.workspaces.roles();
  const ceo = await ops.workspaces.workspace("ceo", org);
  const twin = await ops.entgraph.build(org);
  ok(rt.store.backend() === "file", "the whole suite ran on the LOCAL store");
  ok(roles.length === 8 && ceo && ceo.sections.length >= 4, "executive workspaces project off local data with no cloud dependency", ceo && ceo.sections.length);
  ok(twin && Object.keys(twin).length > 0, "the AI twin is derived locally");
  const packSummary = await ops.industry.summary(org);
  ok(packSummary.packs.every((p) => p.source), "every installed pack records where it came from", packSummary.packs);
  const health = await ops.health();
  ok(health.store.backend === "file", "health reports the local backend", health.store);

  console.log(`\n${pass}/${pass + fail} passed`);
  srv.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });
