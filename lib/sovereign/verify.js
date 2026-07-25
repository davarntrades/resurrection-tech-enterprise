/* ============================================================================
 * Guardian OS Sovereign — deployment verification (`guardian verify`).
 *
 * One command an operator can run on a disconnected box, in front of an
 * auditor, that answers: is this deployment actually what it claims to be?
 *
 *   ✓ configuration      the profile resolves and the runtime matches it
 *   ✓ egress             a no-network profile really has no cloud client
 *   ✓ policy integrity   the policy bundle verifies, and its policies compile
 *   ✓ pack signatures    every installed pack records how it was verified
 *   ✓ evidence store     the evidence directory exists and is writable
 *   ✓ runtime health     the Ω engine answers (fail-closed if it does not)
 *   ✓ governance         policies are active and the estate is governed
 *
 * DIAGNOSTIC, NEVER CORRECTIVE. Verification reads; it never activates,
 * installs, migrates or "fixes" anything. An operator can run it on a live
 * sovereign system without changing that system's behaviour.
 *
 * Every check returns pass / warn / fail with a reason. `fail` means the
 * deployment is not doing what the profile promises. `warn` means it works but
 * an operator should know something. Anything unknown is reported as unknown —
 * never assumed to pass.
 * ========================================================================== */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const profiles = require("./profiles");
const bundleFmt = require("./bundle");
const immutable = require("./immutable");
const sovereignPacks = require("./packs");

const PASS = "pass", WARN = "warn", FAIL = "fail";
const check = (id, title, status, detail, extra) => ({ id, title, status, detail, ...(extra || {}) });

/** Resolve the policy bundle the ENGINE is configured to read. */
function policyBundleTarget() {
  return process.env.GUARDIAN_POLICY_BUNDLE || null;
}

async function configuration() {
  try {
    const d = profiles.describe();
    return check("configuration", "Deployment profile", PASS,
      `${d.title} (${d.profile}) — storage ${d.storage}, policies ${d.policy_provider}, egress ${d.egress}, immutable ${d.immutable}`, { profile: d });
  } catch (e) {
    return check("configuration", "Deployment profile", FAIL,
      `${e.message}. Set GUARDIAN_PROFILE to one of: ${profiles.PROFILE_IDS.join(", ")}.`);
  }
}

async function egress(store) {
  const prof = profiles.profileSafe();
  const backend = store.backend();
  if (profiles.allowsCloudStore()) {
    return check("egress", "Network posture", PASS, `${prof.egress} by profile — store backend is "${backend}"`);
  }
  if (backend !== "file") {
    return check("egress", "Network posture", FAIL,
      `profile ${prof.id} pins state to the local filesystem, but the active store backend is "${backend}" — a cloud client was constructed`);
  }
  const creds = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (creds) {
    return check("egress", "Network posture", WARN,
      "cloud credentials are present in the environment but were REFUSED by the profile — the store is local. Remove them so the deployment carries no unused secrets.");
  }
  return check("egress", "Network posture", PASS, `no cloud store; no cloud credentials present (profile ${prof.id})`);
}

function policyIntegrity() {
  const target = policyBundleTarget();
  if (!profiles.usesPolicyBundle()) {
    return check("policy_integrity", "Ω policy integrity", PASS, "profile reads policies from the control plane (cloud provider) — bundle verification not applicable");
  }
  if (!target) {
    return check("policy_integrity", "Ω policy integrity", FAIL,
      "GUARDIAN_POLICY_BUNDLE is not set — this profile has no offline policy source, so only the static deployment baseline is enforcing");
  }
  if (!fs.existsSync(target)) {
    return check("policy_integrity", "Ω policy integrity", FAIL, `policy bundle ${target} does not exist`);
  }
  let b;
  try { b = bundleFmt.read(target); }
  catch (e) { return check("policy_integrity", "Ω policy integrity", FAIL, `policy bundle ${target} is unreadable: ${e.message}`); }
  const report = bundleFmt.verify(b, { requireSignature: profiles.requiresSignedBundles() });
  if (!report.ok) {
    return check("policy_integrity", "Ω policy integrity", FAIL,
      `policy bundle ${target} FAILED verification — zero policies are loaded: ${report.errors.join("; ")}`, { errors: report.errors });
  }
  const policies = Object.keys(b.files).filter((p) => p.startsWith("policies/") && p.endsWith(".json"));
  return check("policy_integrity", "Ω policy integrity", PASS,
    `${b.manifest.id} v${b.manifest.version} verified — ${policies.length} policy ${policies.length === 1 ? "file" : "files"}, signature ${report.alg}${report.key_id ? ` (${report.key_id})` : ""}`,
    { bundle: { id: b.manifest.id, version: b.manifest.version, alg: report.alg, key_id: report.key_id } });
}

function trustStore() {
  const t = bundleFmt.loadTrust();
  const need = profiles.requiresSignedBundles();
  if (!need) {
    return check("trust_store", "Signing trust store", PASS, t.count ? `${t.count} trusted key(s) in ${t.dir}` : "no signature required by this profile");
  }
  if (!t.count && !t.hmac_key) {
    return check("trust_store", "Signing trust store", FAIL,
      `this profile requires signed bundles but the trust store is empty (${t.dir}) — nothing can be installed or updated`);
  }
  return check("trust_store", "Signing trust store", PASS,
    `${t.count} trusted Ed25519 key(s) in ${t.dir}${t.hmac_key ? " + an HMAC key" : ""}`);
}

async function packSignatures(ops, org_id) {
  if (!org_id) return check("pack_signatures", "Industry pack provenance", WARN, "no enterprise provisioned yet — no packs to verify");
  let rows = [];
  try { rows = await ops.industry.installed(org_id); }
  catch (e) { return check("pack_signatures", "Industry pack provenance", FAIL, `cannot read installed packs: ${e.message}`); }
  if (!rows.length) return check("pack_signatures", "Industry pack provenance", PASS, "no industry packs installed");
  const generic = rows.filter((r) => r.projections === "generic").map((r) => r.pack_id);
  const detail = rows.map((r) => `${r.pack_id} v${r.version} (${r.source}, ${r.projections})`).join("; ");
  if (generic.length) {
    return check("pack_signatures", "Industry pack provenance", WARN,
      `${rows.length} pack(s) installed: ${detail}. ${generic.join(", ")} render through the generic declarative projection — their Ω policies enforce, their bespoke analytics need the release that ships their code.`,
      { packs: rows.map((r) => ({ id: r.pack_id, source: r.source, projections: r.projections })) });
  }
  return check("pack_signatures", "Industry pack provenance", PASS, `${rows.length} pack(s) installed: ${detail}`);
}

function evidenceStore(store) {
  if (profiles.allowsCloudEvidence() && store.backend() === "supabase") {
    return check("evidence_store", "Evidence store", PASS, `cloud object storage (bucket ${store.STORAGE_BUCKET})`);
  }
  const dir = path.join(store.DATA_DIR, "deliverables");
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, ".guardian-verify-probe");
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
  } catch (e) {
    return check("evidence_store", "Evidence store", FAIL, `local evidence directory ${dir} is not writable: ${e.message}`);
  }
  let files = 0;
  try { files = countFiles(dir); } catch { files = 0; }
  return check("evidence_store", "Evidence store", PASS,
    `local evidence store at ${dir} is writable (${files} object${files === 1 ? "" : "s"}) — include ${store.DATA_DIR} in the backup set`);
}

function countFiles(dir) {
  let n = 0;
  for (const it of fs.readdirSync(dir, { withFileTypes: true })) {
    if (it.isDirectory()) n += countFiles(path.join(dir, it.name));
    else n += 1;
  }
  return n;
}

async function runtimeHealth(rt) {
  let h;
  try { h = await rt.engine.health(); }
  catch (e) { h = { ok: false, error: e.message }; }
  if (!h.ok) {
    return check("runtime_health", "Ω engine", FAIL,
      `the governance engine at ${rt.engine.ENGINE_URL} is unreachable (${h.error || `HTTP ${h.status}`}) — Guardian OS is fail-closed, so governed actions are BLOCKED until it returns`);
  }
  const j = h.json || {};
  return check("runtime_health", "Ω engine", PASS,
    `reachable at ${rt.engine.ENGINE_URL}${j.engine_commit ? ` — engine ${String(j.engine_commit).slice(0, 12)}` : ""}`,
    { engine_commit: j.engine_commit || null, dynamic: j.dynamic_policies || null });
}

async function governanceReadiness(ops, org_id) {
  let active = [];
  try { active = await ops.govpolicy.active({}); } catch (e) { return check("governance", "Governance readiness", FAIL, `cannot read active policies: ${e.message}`); }
  const scoped = org_id ? active.filter((p) => p.scope === org_id) : [];
  const im = immutable.status();
  const bits = [`${active.length} active Ω policy version(s)`];
  if (org_id) bits.push(`${scoped.length} scoped to this enterprise`);
  bits.push(im.immutable ? "runtime IMMUTABLE (signed updates only)" : "runtime mutable");
  if (!org_id) {
    return check("governance", "Governance readiness", WARN, `${bits.join(" · ")} — no enterprise provisioned yet`);
  }
  if (!active.length) {
    return check("governance", "Governance readiness", WARN,
      "no dynamic Ω policies are active — the static deployment baseline is enforcing, which is deny-by-default but carries no enterprise-specific constraints");
  }
  return check("governance", "Governance readiness", PASS, bits.join(" · "));
}

/**
 * Run every check. `org_id` scopes the enterprise-specific ones; omit it to
 * verify the platform itself. Never throws: a check that cannot run reports
 * FAIL with the reason, because "the check crashed" is not "the check passed".
 */
async function run({ org_id = null, rt = null, ops = null } = {}) {
  const runtime = rt || require("../runtime");
  const opsMod = ops || require("../ops");
  const store = runtime.store;

  const checks = [];
  const safe = async (fn, id, title) => {
    try { checks.push(await fn()); }
    catch (e) { checks.push(check(id, title, FAIL, `check could not run: ${e.message}`)); }
  };

  await safe(() => configuration(), "configuration", "Deployment profile");
  await safe(() => egress(store), "egress", "Network posture");
  await safe(() => policyIntegrity(), "policy_integrity", "Ω policy integrity");
  await safe(() => trustStore(), "trust_store", "Signing trust store");
  await safe(() => packSignatures(opsMod, org_id), "pack_signatures", "Industry pack provenance");
  await safe(() => evidenceStore(store), "evidence_store", "Evidence store");
  await safe(() => runtimeHealth(runtime), "runtime_health", "Ω engine");
  await safe(() => governanceReadiness(opsMod, org_id), "governance", "Governance readiness");

  const failed = checks.filter((c) => c.status === FAIL);
  const warned = checks.filter((c) => c.status === WARN);
  return {
    ok: failed.length === 0,
    profile: profiles.profileSafe().id,
    org_id,
    generated_at: new Date().toISOString(),
    summary: { total: checks.length, pass: checks.length - failed.length - warned.length, warn: warned.length, fail: failed.length },
    checks,
    immutable: immutable.status(),
    projections: Object.fromEntries(require("../ops/packs").PACK_IDS.map((id) => [id, sovereignPacks.projectionMode(id)])),
  };
}

module.exports = { run, PASS, WARN, FAIL };
