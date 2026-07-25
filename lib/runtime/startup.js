/* ============================================================================
 * Guardian OS — startup validation.
 *
 * Every incident in this codebase's history has the same shape: the deployment
 * was not what someone believed it was, and nothing said so. A cloud store that
 * silently became local disk. A CI workflow that never parsed and therefore
 * never ran. A Node version too old for the database client. In each case the
 * information needed to catch it existed somewhere and was never surfaced.
 *
 * So this reports, on one screen, the eight facts that determine whether the
 * platform is what it claims to be:
 *
 *   node version · runtime environment · storage backend · policy provider
 *   evidence provider · deployment profile · cloud credential state · network mode
 *
 * SEVERITY IS THE POINT. Anything that would make the platform lie about itself
 * is `fail`; anything an operator should know but that does not compromise
 * integrity is `warn`. `run({ strict: true })` throws on any failure, which is
 * what a production boot should do — a governance platform that starts in an
 * unknown state is worse than one that refuses to start.
 *
 *   node -e "require('./lib/runtime/startup').print()"
 *   npm run runtime:startup
 * ========================================================================== */
"use strict";
const store = require("./store");
const log = require("./log");

const PASS = "pass", WARN = "warn", FAIL = "fail";
const MIN_NODE = 22;

const check = (id, label, status, value, detail) => ({ id, label, status, value, detail });

/** The major version this platform requires, read from package.json so the
 *  number lives in exactly one place. */
function requiredNodeMajor() {
  try {
    const eng = require("../../package.json").engines || {};
    const m = /(\d+)/.exec(String(eng.node || ""));
    return m ? Number(m[1]) : MIN_NODE;
  } catch { return MIN_NODE; }
}

function nodeCheck() {
  const want = requiredNodeMajor();
  const major = Number(process.versions.node.split(".")[0]);
  if (major < want) {
    return check("node", "Node version", FAIL, process.version,
      `this platform requires Node >= ${want}. On Node < 22 @supabase/supabase-js cannot construct a client (no native WebSocket), which previously caused a SILENT downgrade to local disk. Upgrade the runtime; do not work around this.`);
  }
  return check("node", "Node version", PASS, process.version, `meets the required minimum (>= ${want})`);
}

function environmentCheck() {
  const env = process.env.NODE_ENV || "development";
  const vercel = !!process.env.VERCEL;
  const container = !!process.env.KUBERNETES_SERVICE_HOST || !!process.env.RAILWAY_ENVIRONMENT;
  const where = vercel ? "vercel" : container ? "container" : "self-hosted";
  return check("environment", "Runtime environment", PASS, `${env} · ${where}`,
    `${process.platform}/${process.arch}, pid ${process.pid}`);
}

function storageCheck() {
  const backend = store.backend();
  const fault = store.storageFault();
  if (fault) {
    return check("storage", "Storage backend", FAIL, `${backend} (DOWNGRADED)`,
      `durable storage is configured but could not be initialised: ${fault.detail}. Writes are refused rather than silently landing on local disk.${fault.downgrade_allowed ? " RUNTIME_ALLOW_STORAGE_DOWNGRADE is set, so writes WILL proceed to local disk — development only." : ""}`);
  }
  if (backend === "supabase") return check("storage", "Storage backend", PASS, "supabase", "durable, concurrency-safe");
  if (store.cloudRefused()) {
    return check("storage", "Storage backend", PASS, "local (cloud refused by profile)",
      `state is pinned to ${store.DATA_DIR} by the deployment profile; credentials present but deliberately unused`);
  }
  const profiles = require("../sovereign/profiles");
  const intentional = profiles.profileSafe().storage === "local";
  return check("storage", "Storage backend", intentional ? PASS : WARN, "local file store",
    intentional
      ? `${store.DATA_DIR} — the deployment target for this profile. Back it up; run a single writer per directory.`
      : `${store.DATA_DIR} — no durable store configured. Fine for development; configure Supabase before live customer traffic.`);
}

function policyProviderCheck() {
  const profiles = require("../sovereign/profiles");
  const bundlePath = process.env.GUARDIAN_POLICY_BUNDLE || null;
  if (!profiles.usesPolicyBundle()) {
    return check("policy_provider", "Ω policy provider", PASS, "control plane",
      "dynamic policies are read from the governance database by the engine");
  }
  if (!bundlePath) {
    return check("policy_provider", "Ω policy provider", FAIL, "bundle (NOT CONFIGURED)",
      "this profile reads Ω policy from a signed bundle, but GUARDIAN_POLICY_BUNDLE is unset — only the static deployment baseline is enforcing");
  }
  try {
    const bundle = require("../sovereign/bundle");
    const b = bundle.read(bundlePath);
    const report = bundle.verify(b, { requireSignature: profiles.requiresSignedBundles() });
    if (!report.ok) {
      return check("policy_provider", "Ω policy provider", FAIL, "bundle (FAILED VERIFICATION)",
        `${bundlePath}: ${report.errors.join("; ")} — zero policies are loaded (fail-closed)`);
    }
    return check("policy_provider", "Ω policy provider", PASS, `bundle ${b.manifest.id} v${b.manifest.version}`,
      `${bundlePath}, ${report.alg} signature${report.key_id ? ` (${report.key_id})` : ""}`);
  } catch (e) {
    return check("policy_provider", "Ω policy provider", FAIL, "bundle (UNREADABLE)", `${bundlePath}: ${e.message}`);
  }
}

function evidenceProviderCheck() {
  const profiles = require("../sovereign/profiles");
  const cloud = profiles.allowsCloudEvidence() && store.backend() === "supabase";
  if (cloud) return check("evidence_provider", "Evidence provider", PASS, "cloud object storage", `bucket ${store.STORAGE_BUCKET}`);
  const fs = require("node:fs");
  const path = require("node:path");
  const dir = path.join(store.DATA_DIR, "deliverables");
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, ".startup-probe");
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
  } catch (e) {
    return check("evidence_provider", "Evidence provider", FAIL, "local (NOT WRITABLE)", `${dir}: ${e.message}`);
  }
  return check("evidence_provider", "Evidence provider", PASS, "local filesystem", `${dir} — include it in the backup set`);
}

function profileCheck() {
  const profiles = require("../sovereign/profiles");
  try {
    const d = profiles.describe();
    return check("profile", "Deployment profile", PASS, d.profile,
      `${d.title} — storage ${d.storage}, policies ${d.policy_provider}, egress ${d.egress}, immutable ${d.immutable}`);
  } catch (e) {
    return check("profile", "Deployment profile", FAIL, process.env.GUARDIAN_PROFILE || "(unset)",
      `${e.message} — an unknown profile is refused rather than defaulted, so nothing is running under an assumed posture`);
  }
}

function credentialCheck() {
  const profiles = require("../sovereign/profiles");
  const present = [];
  for (const [name, v] of [
    ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY],
    ["ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY],
    ["RESEND_API_KEY", process.env.RESEND_API_KEY],
    ["RENDERER_URL", process.env.RENDERER_URL],
  ]) if (v) present.push(name);

  if (!profiles.allowsCloudStore() && present.length) {
    return check("credentials", "Cloud credential state", WARN, `${present.length} present, unused`,
      `this profile permits no cloud services, so ${present.join(", ")} are inert. Remove them: a deployment should not carry secrets it has no use for.`);
  }
  if (!present.length) return check("credentials", "Cloud credential state", PASS, "none configured", "no cloud service credentials are present");
  return check("credentials", "Cloud credential state", PASS, `${present.length} configured`, present.join(", "));
}

function networkCheck() {
  const profiles = require("../sovereign/profiles");
  const p = profiles.profileSafe();
  const sovereignBuild = /^(1|true|yes|on)$/i.test(String(process.env.SOVEREIGN_BUILD || ""));
  if (p.egress === "denied") {
    return check("network", "Network mode", PASS, "egress denied",
      `no outbound connection is permitted by this profile${sovereignBuild ? "; the interface was built offline-clean" : "; NOTE the interface was NOT built with SOVEREIGN_BUILD=1, so it may still request fonts/telemetry"}`);
  }
  return check("network", "Network mode", PASS, `egress ${p.egress}`, `outbound connections are permitted by the ${p.id} profile`);
}

/**
 * Run every startup check.
 *   strict  throw on any failure (what a production boot should do)
 */
function run({ strict = false } = {}) {
  const checks = [];
  const safe = (fn, id, label) => {
    try { checks.push(fn()); }
    catch (e) { checks.push(check(id, label, FAIL, "unknown", `check could not run: ${e.message}`)); }
  };
  safe(nodeCheck, "node", "Node version");
  safe(environmentCheck, "environment", "Runtime environment");
  safe(storageCheck, "storage", "Storage backend");
  safe(policyProviderCheck, "policy_provider", "Ω policy provider");
  safe(evidenceProviderCheck, "evidence_provider", "Evidence provider");
  safe(profileCheck, "profile", "Deployment profile");
  safe(credentialCheck, "credentials", "Cloud credential state");
  safe(networkCheck, "network", "Network mode");

  const failed = checks.filter((c) => c.status === FAIL);
  const warned = checks.filter((c) => c.status === WARN);
  const result = {
    ok: failed.length === 0,
    checked_at: new Date().toISOString(),
    summary: { total: checks.length, pass: checks.length - failed.length - warned.length, warn: warned.length, fail: failed.length },
    checks,
  };

  // The report is itself evidence: a deployment that started degraded should be
  // discoverable afterwards, not only by whoever was watching the console.
  log[failed.length ? "error" : warned.length ? "warn" : "info"]("startup_validation", {
    ok: result.ok, summary: result.summary,
    failures: failed.map((c) => `${c.id}: ${c.detail}`),
  });

  if (strict && failed.length) {
    const e = new Error(`startup validation failed (${failed.length}): ${failed.map((c) => `${c.label} — ${c.detail}`).join(" | ")}`);
    e.code = "STARTUP_VALIDATION_FAILED";
    e.checks = checks;
    throw e;
  }
  return result;
}

/** Human-readable form for a console or a container log. */
function print(opts) {
  const r = run(opts);
  const MARK = { pass: "✓", warn: "!", fail: "✗" };
  const lines = ["", "Guardian OS — startup validation", ""];
  for (const c of r.checks) {
    lines.push(`  ${MARK[c.status]} ${c.label.padEnd(24)} ${String(c.value)}`);
    if (c.detail) lines.push(`    ${" ".repeat(24)} ${c.detail}`);
  }
  lines.push("", `  ${r.summary.pass} passed · ${r.summary.warn} warning(s) · ${r.summary.fail} failure(s)`, "");
  console.log(lines.join("\n"));
  return r;
}

module.exports = { run, print, PASS, WARN, FAIL, requiredNodeMajor };
