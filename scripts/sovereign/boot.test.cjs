/* ============================================================================
 * Guardian OS Sovereign — per-profile boot proof.
 *
 * "Every build should prove Guardian OS can start successfully under each
 * deployment profile." This is that proof. It takes the profile from
 * GUARDIAN_PROFILE, boots the whole platform under it, and asserts the
 * deployment behaves the way the profile PROMISES — not merely that nothing
 * threw:
 *
 *   • the store backend matches the profile's storage provider;
 *   • cloud credentials are refused, not just unused, where storage is local;
 *   • the immutable runtime is on exactly where the profile mandates it;
 *   • an enterprise provisions, a pack installs through the route that profile
 *     allows, and the executive workspaces + AI twin still render;
 *   • `guardian verify` runs and reports the deployment honestly.
 *
 * Run for one profile:   GUARDIAN_PROFILE=air_gapped node scripts/sovereign/boot.test.cjs
 * Run for all six:                            node scripts/sovereign/boot.test.cjs --all
 * ========================================================================== */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ALL = process.argv.includes("--all");
const TARGETS = ALL
  ? ["cloud", "hybrid", "private_cloud", "on_prem", "sovereign", "air_gapped"]
  : [process.env.GUARDIAN_PROFILE || "cloud"];

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "gos-boot-"));
process.env.RUNTIME_DATA_DIR = path.join(TMP, "data");
process.env.GUARDIAN_TRUST_DIR = path.join(TMP, "trust");
fs.mkdirSync(process.env.GUARDIAN_TRUST_DIR, { recursive: true });
delete process.env.ANTHROPIC_API_KEY;

const { startMockEngine } = require("../ops/mock-engine.cjs");

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`    [PASS] ${name}`); }
  else { fail++; console.log(`    [FAIL] ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); }
}

// One pack per profile. The estate is deliberately SHARED across the run —
// store.DATA_DIR is fixed at module load, and reusing one enterprise proves
// something better than isolation would: the same governed estate can be
// operated from six different deployment postures without contradiction.
const PACK_FOR = { cloud: "finance", hybrid: "healthcare", private_cloud: "insurance", on_prem: "retail", sovereign: "government", air_gapped: "cybersecurity" };

async function bootOne(profileId, ctx) {
  const { sovereign, ops, rt, bundle, signing } = ctx;
  const { profiles } = sovereign;
  process.env.GUARDIAN_PROFILE = profileId;
  rt.store.resetBackend();
  const packId = PACK_FOR[profileId] || "finance";

  const p = profiles.profile();
  console.log(`\n  ── ${p.title} (${p.id}) ${"─".repeat(Math.max(0, 46 - p.title.length - p.id.length))}`);

  // 1. Storage provider matches the profile.
  const wantCloud = p.storage === "cloud";
  ok(rt.store.backend() === (wantCloud && ctx.cloudConfigured ? "supabase" : "file"),
    `store backend matches the profile (${p.storage})`, rt.store.backend());
  if (!wantCloud) {
    ok(rt.store.cloudRefused() === ctx.cloudConfigured,
      ctx.cloudConfigured ? "cloud credentials present in the environment are REFUSED" : "no cloud client is built");
  }

  // 2. Immutability matches the profile.
  ok(sovereign.immutable.locked() === !!p.immutable_default,
    `immutable runtime is ${p.immutable_default ? "ON" : "off"} as the profile mandates`, sovereign.immutable.status());

  // 3. The platform boots: provision an enterprise and govern it.
  const prov = await ops.provisioning.provision({ industry: "financial services" }, { actor: "boot-test" });
  const org = prov.org_id;
  ok(!!org, "an enterprise provisions under this profile", org);

  // 4. A pack installs through the route this profile permits.
  const packFile = path.join(TMP, `${packId}-${profileId}.pack`);
  bundle.writeFile(sovereign.packs.exportPack(packId, { sign: signing }), packFile);
  let installed;
  if (profiles.immutable()) {
    installed = await ops.industry.installFromBundle(org, packFile, { actor: "guardian-cli" });
    ok(installed.activated > 0, `${packId} installs ONLY through a verified signed bundle`, installed.activated);
  } else {
    installed = await ops.industry.install(org, packId, { actor: "boot-test" });
    ok(installed.activated > 0, `${packId} installs through the ordinary governed lifecycle`, installed.activated);
  }
  const missing = await ops.industry.installFromBundle(org, path.join(TMP, "does-not-exist.pack"), { actor: "guardian-cli" })
    .catch((e) => ({ error: e.message }));
  ok(!!missing.error, "an offline install of a bundle that is not there is refused", missing.error);
  ok((await ops.govpolicy.active({ scope: org })).length > 0, "the pack's Ω policies are enforcing");

  // 5. The governed surfaces still render.
  await ops.managed.monitor(org, { actor: "guardian_os" });
  const ceo = await ops.workspaces.workspace("ceo", org);
  const twin = await ops.entgraph.build(org);
  const health = await ops.health();
  ok(ceo && ceo.sections.length >= 4, "executive workspaces render", ceo && ceo.sections.length);
  ok(twin && Object.keys(twin).length > 0, "the AI twin is derived");
  ok(health.status === "ok" || /^degraded_/.test(health.status), "platform health reports a known state", health.status);

  // 6. guardian verify runs and is honest about this deployment.
  const v = await sovereign.verify.run({ org_id: org });
  ok(v.checks.length === 8, "guardian verify runs all eight checks", v.checks.map((c) => c.id));
  ok(v.checks.find((c) => c.id === "egress").status === "pass", "verify: network posture matches the profile",
    v.checks.find((c) => c.id === "egress").detail);
  const pi = v.checks.find((c) => c.id === "policy_integrity");
  ok(profiles.usesPolicyBundle() ? pi.status === "fail" : pi.status === "pass",
    profiles.usesPolicyBundle()
      ? "verify: an offline profile with no bundle configured FAILS (honest, not optimistic)"
      : "verify: a control-plane profile needs no bundle",
    pi.detail);
}

async function main() {
  const srv = await startMockEngine({ governancePolicies: true });
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${srv.address().port}`;

  const sovereign = require("../../lib/sovereign");
  const ops = require("../../lib/ops");
  const rt = require("../../lib/runtime");
  const bundle = sovereign.bundle;

  const key = bundle.keygen({ key_id: "boot-test" });
  fs.writeFileSync(path.join(process.env.GUARDIAN_TRUST_DIR, `${key.key_id}.pub`), `${key.public_key}\n`);
  const signing = { alg: "ed25519", key_id: key.key_id, private_key_pem: key.private_key_pem };

  // Cloud credentials are left in the environment ON PURPOSE for every profile:
  // a local-storage profile must REFUSE them, which is a stronger property than
  // simply not having them.
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const cloudConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  console.log(`\nGuardian OS — deployment profile boot proof (mock engine on :${srv.address().port})`);
  console.log(`  profiles: ${TARGETS.join(", ")}${cloudConfigured ? "  [cloud credentials present]" : ""}`);

  for (const id of TARGETS) {
    await bootOne(id, { sovereign, ops, rt, bundle, signing, cloudConfigured });
  }

  console.log(`\n${pass}/${pass + fail} passed`);
  srv.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("boot proof crashed:", e); process.exit(1); });
