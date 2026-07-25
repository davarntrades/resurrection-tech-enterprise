#!/usr/bin/env node
/* ============================================================================
 * guardian — the Guardian OS Sovereign operator CLI.
 *
 * Everything a disconnected estate needs to install, update and prove its
 * governance without a network:
 *
 *   guardian profile                       show the active deployment profile
 *   guardian profile list                  every profile and what it configures
 *   guardian keygen [--out DIR]            create an Ed25519 signing identity
 *   guardian bundle policies <SRC> [...]   build a signed Ω policy bundle
 *   guardian bundle update <SRC> [...]     build a signed offline update package
 *   guardian install <BUNDLE>              install a policy bundle (activate it)
 *   guardian pack list                     packs available in this build
 *   guardian pack export <ID|--all> [...]  publish pack bundles
 *   guardian pack install <BUNDLE>         install a pack from signed media
 *   guardian update <BUNDLE.gos>           apply a signed offline update
 *   guardian update history|rollback <ID>  review / reverse an applied update
 *   guardian verify                        prove the deployment is what it claims
 *   guardian export evidence <OUT>         copy the evidence store off the box
 *
 * Commands that only touch the bundle format (profile, keygen, bundle, verify
 * of a file) load nothing but lib/sovereign — they work on a publisher's laptop
 * with no database and no engine. Commands that change governed state load the
 * platform and go through the ordinary governed lifecycle.
 *
 * Exit codes: 0 success · 1 failure · 2 usage error.
 * ========================================================================== */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const sovereign = require(path.join(ROOT, "lib", "sovereign"));
const { profiles, bundle: fmt, packs: sovPacks, updates } = sovereign;

// ── Output ──────────────────────────────────────────────────────────────────
const isTTY = process.stdout.isTTY;
const c = (code, s) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => c("1", s), dim = (s) => c("2", s);
const green = (s) => c("32", s), yellow = (s) => c("33", s), red = (s) => c("31", s), cyan = (s) => c("36", s);
const MARK = { pass: green("✓"), warn: yellow("!"), fail: red("✗") };

let JSON_OUT = false;
const out = (s) => { if (!JSON_OUT) console.log(s); };
function emit(obj) { if (JSON_OUT) console.log(JSON.stringify(obj, null, 2)); }
function die(msg, code = 1) {
  if (JSON_OUT) console.log(JSON.stringify({ ok: false, error: String(msg) }, null, 2));
  else console.error(`${red("guardian:")} ${msg}`);
  process.exit(code);
}

// ── Argument parsing ────────────────────────────────────────────────────────
function parse(argv) {
  const flags = {}; const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") { positional.push(...argv.slice(i + 1)); break; }
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith("--")) flags[k] = argv[++i];
      else flags[k] = true;
    } else positional.push(a);
  }
  return { flags, positional };
}

/** Signing options shared by every `bundle`/`export` command. */
function signingFrom(flags) {
  if (flags["hmac-key"]) return { alg: "hmac-sha256", key_id: flags["key-id"] || "hmac", secret: String(flags["hmac-key"]) };
  const keyFile = flags["sign-key"] || flags.key;
  if (!keyFile) return null;
  let pem;
  try { pem = fs.readFileSync(keyFile, "utf8"); } catch (e) { die(`cannot read signing key ${keyFile}: ${e.message}`); }
  const keyId = flags["key-id"] || path.basename(String(keyFile)).replace(/\.(pem|key)$/i, "");
  return { alg: "ed25519", key_id: keyId, private_key_pem: pem };
}

function trustFrom(flags) {
  return fmt.loadTrust({ dir: flags.trust || undefined, hmacKey: flags["hmac-key"] || undefined });
}

// ── Commands ────────────────────────────────────────────────────────────────

function cmdProfile(pos) {
  if (pos[0] === "list") {
    const all = profiles.list();
    emit({ ok: true, profiles: all });
    out(bold("\nGuardian OS deployment profiles\n"));
    for (const p of all) {
      out(`  ${bold(p.profile.padEnd(15))} ${p.summary}`);
      out(`  ${" ".repeat(15)} ${dim(`storage ${p.storage} · evidence ${p.evidence} · policies ${p.policy_provider} · egress ${p.egress} · updates ${p.updates}${p.require_signed_bundles ? " · signed bundles required" : ""}`)}`);
    }
    out("");
    return 0;
  }
  let s;
  try { s = sovereign.status(); } catch (e) { return die(e.message); }
  emit({ ok: true, ...s });
  out(bold(`\n${s.title} (${s.profile})`));
  out(`  ${s.summary}\n`);
  out(`  storage          ${s.storage}`);
  out(`  evidence         ${s.evidence}`);
  out(`  policy provider  ${s.policy_provider}${s.policy_bundle ? dim(` — ${s.policy_bundle}`) : ""}`);
  out(`  egress           ${s.egress}`);
  out(`  telemetry        ${s.telemetry ? "on" : "off"}`);
  out(`  updates          ${s.updates}`);
  out(`  immutable        ${s.immutable.immutable ? green("yes") : "no"}`);
  out(`  trust store      ${s.trust_store.keys} key(s) in ${s.trust_store.dir}${s.trust_store.hmac_configured ? " + HMAC" : ""}`);
  out("");
  return 0;
}

function cmdKeygen(pos, flags) {
  const key = fmt.keygen({ key_id: flags["key-id"] });
  const dir = flags.out || pos[0] || path.join(process.cwd(), ".guardian", "keys");
  fs.mkdirSync(dir, { recursive: true });
  const priv = path.join(dir, `${key.key_id}.pem`);
  const pub = path.join(dir, `${key.key_id}.pub`);
  fs.writeFileSync(priv, key.private_key_pem, { mode: 0o600 });
  fs.writeFileSync(pub, `# Guardian OS signing key ${key.key_id}\n${key.public_key}\n`);
  emit({ ok: true, key_id: key.key_id, public_key: key.public_key, private_key_file: priv, public_key_file: pub });
  out(bold("\nSigning identity created\n"));
  out(`  key id       ${cyan(key.key_id)}`);
  out(`  private key  ${priv}  ${red("(keep OFF the sovereign estate — it never needs to be there)")}`);
  out(`  public key   ${pub}`);
  out(`\n  Provision the ${bold("public")} key into each sovereign deployment's trust store:`);
  out(dim(`    cp ${pub} $GUARDIAN_TRUST_DIR/\n`));
  return 0;
}

/** Read a source directory into { relativePath: Buffer }. */
function readTree(src) {
  const abs = path.resolve(src);
  const st = fs.statSync(abs);
  if (st.isFile()) return { [path.basename(abs)]: fs.readFileSync(abs) };
  const files = {};
  const walk = (rel) => {
    for (const it of fs.readdirSync(path.join(abs, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${it.name}` : it.name;
      if (it.isDirectory()) walk(r);
      else files[r] = fs.readFileSync(path.join(abs, r));
    }
  };
  walk("");
  return files;
}

function cmdBundle(pos, flags) {
  const kind = pos[0];
  if (!["policies", "update", "pack"].includes(kind)) return die("usage: guardian bundle <policies|update|pack> <SRC> --out FILE [--sign-key KEY]", 2);
  const src = pos[1];
  if (!src) return die("a source directory is required", 2);
  const sign = signingFrom(flags);
  if (!sign && !flags.unsigned) return die("refusing to build an unsigned bundle — pass --sign-key KEY.pem (or --hmac-key SECRET), or --unsigned to override", 2);

  let files = readTree(src);
  if (kind === "policies") {
    // Normalise: every policy lands under policies/ so the engine finds it.
    files = Object.fromEntries(Object.entries(files).map(([p, b]) => [p.startsWith("policies/") ? p : `policies/${path.basename(p)}`, b]));
    const bad = Object.keys(files).filter((p) => !p.endsWith(".json"));
    if (bad.length) return die(`a policy bundle may contain only .json policy files — found ${bad.join(", ")}`, 2);
  }
  const id = flags.id || path.basename(path.resolve(src));
  const version = flags.version || "1.0.0";
  const built = fmt.build({ kind, id, version, files, sign, produced_by: flags["produced-by"] || "guardian-cli/1" });
  const outFile = flags.out || `${id}-${version}.gos`;
  if (flags.dir) fmt.writeDir(built, outFile);
  else fmt.writeFile(built, outFile);
  emit({ ok: true, out: outFile, kind, id, version, entries: built.manifest.entries.length, signature: built.manifest.signature.alg, key_id: built.manifest.signature.key_id });
  out(`\n${green("✓")} built ${bold(outFile)} — ${kind} ${id} v${version}, ${built.manifest.entries.length} entr${built.manifest.entries.length === 1 ? "y" : "ies"}, signature ${built.manifest.signature.alg}\n`);
  return 0;
}

async function cmdInstall(pos, flags) {
  const target = pos[0];
  if (!target) return die("usage: guardian install <BUNDLE-DIR|BUNDLE.gos>", 2);
  const b = fmt.read(target);
  const report = fmt.verify(b, { trust: trustFrom(flags), requireSignature: flags["require-signature"] !== undefined ? !!flags["require-signature"] : profiles.requiresSignedBundles() });
  if (!report.ok) return die(`bundle failed verification:\n  - ${report.errors.join("\n  - ")}`);
  if (b.manifest.kind !== "policies") return die(`${target} is a "${b.manifest.kind}" bundle — use \`guardian ${b.manifest.kind === "pack" ? "pack install" : "update"}\``, 2);

  const specs = Object.keys(b.files).filter((p) => p.startsWith("policies/") && p.endsWith(".json"));

  // A policy bundle is the ENGINE's offline source of truth. Installing it means
  // placing it where the engine reads it — not writing rows to a database that
  // an air-gapped deployment does not have.
  const dest = flags.to || process.env.GUARDIAN_POLICY_BUNDLE;
  if (!dest) return die("set GUARDIAN_POLICY_BUNDLE (or pass --to DIR) so the engine knows where to read policies from", 2);
  if (fs.existsSync(dest) && !flags.force) {
    const prev = (() => { try { return fmt.read(dest).manifest; } catch { return null; } })();
    if (prev) out(dim(`  replacing ${prev.id} v${prev.version} at ${dest}`));
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fmt.writeDir(b, dest);

  emit({ ok: true, installed: dest, bundle: { id: b.manifest.id, version: b.manifest.version }, policies: specs.length, signature: report.alg, key_id: report.key_id });
  out(`\n${green("✓")} installed policy bundle ${bold(`${b.manifest.id} v${b.manifest.version}`)} → ${dest}`);
  out(`  ${specs.length} polic${specs.length === 1 ? "y" : "ies"}, signature ${report.alg}${report.key_id ? ` (${report.key_id})` : ""}`);
  out(dim("  restart the governance service to load them (hot reload is off by default for deterministic deployments)\n"));
  return 0;
}

async function cmdPack(pos, flags) {
  const sub = pos[0];
  const registry = require(path.join(ROOT, "lib", "ops", "packs"));

  if (!sub || sub === "list") {
    const rows = registry.catalog();
    emit({ ok: true, packs: rows.map((p) => ({ id: p.id, version: p.version, industry: p.industry, policies: p.counts.policies })) });
    out(bold("\nIndustry Intelligence Packs in this build\n"));
    for (const p of rows) out(`  ${bold(p.id.padEnd(15))} v${p.version.padEnd(8)} ${p.industry.padEnd(16)} ${dim(`${p.counts.policies} policies · ${p.counts.mappings} evidence mappings`)}`);
    out("");
    return 0;
  }

  if (sub === "export") {
    const sign = signingFrom(flags);
    if (!sign && !flags.unsigned) return die("refusing to publish an unsigned pack — pass --sign-key KEY.pem (or --unsigned to override)", 2);
    const dir = flags.out || process.cwd();
    fs.mkdirSync(dir, { recursive: true });
    const ids = flags.all || pos[1] === "--all" ? registry.PACK_IDS : pos.slice(1);
    if (!ids.length) return die("usage: guardian pack export <ID...|--all> [--out DIR] --sign-key KEY", 2);
    const written = [];
    for (const id of ids) {
      if (!registry.get(id)) return die(`unknown pack "${id}" — available: ${registry.PACK_IDS.join(", ")}`, 2);
      written.push(fmt.writeFile(sovPacks.exportPack(id, { sign }), path.join(dir, `${id}.pack`)));
    }
    emit({ ok: true, written, signature: sign ? sign.alg : "none" });
    out(`\n${green("✓")} exported ${written.length} pack bundle(s) to ${bold(dir)}`);
    for (const f of written) out(`  ${path.basename(f)}`);
    out("");
    return 0;
  }

  if (sub === "install") {
    const target = pos[1];
    if (!target) return die("usage: guardian pack install <BUNDLE.pack> [--org ORG_ID]", 2);
    const ops = require(path.join(ROOT, "lib", "ops"));
    const org = flags.org || (await defaultOrg());
    if (!org) return die("no enterprise found — provision one first, or pass --org ORG_ID", 2);
    let res;
    try {
      res = await ops.industry.installFromBundle(org, target, {
        actor: flags.actor || "guardian-cli", trust: trustFrom(flags),
        requireSignature: flags["require-signature"] !== undefined ? !!flags["require-signature"] : null,
      });
    } catch (e) { return die(e.message); }
    emit({ ok: true, ...res });
    out(`\n${green("✓")} installed ${bold(res.pack.title)} v${res.version} into ${org}`);
    out(`  ${res.activated} Ω polic${res.activated === 1 ? "y" : "ies"} activated · signature ${res.bundle.alg}${res.bundle.key_id ? ` (${res.bundle.key_id})` : ""} · projections ${res.projections}`);
    if (res.projections === "generic") out(yellow("  note: this build does not carry the pack's projection code — policies enforce, analytics render generically"));
    out("");
    return 0;
  }

  if (sub === "uninstall") {
    const id = pos[1];
    if (!id) return die("usage: guardian pack uninstall <ID> [--org ORG_ID]", 2);
    const ops = require(path.join(ROOT, "lib", "ops"));
    const org = flags.org || (await defaultOrg());
    if (!org) return die("no enterprise found — pass --org ORG_ID", 2);
    let res;
    try { res = await ops.industry.uninstall(org, id, { actor: flags.actor || "guardian-cli" }); }
    catch (e) { return die(e.message); }
    emit({ ok: true, ...res });
    out(`\n${green("✓")} removed ${bold(id)} — ${res.policies_rolled_back.length} polic${res.policies_rolled_back.length === 1 ? "y" : "ies"} rolled back\n`);
    return 0;
  }

  return die(`unknown pack command "${sub}" — expected list, export, install or uninstall`, 2);
}

async function cmdUpdate(pos, flags) {
  const ops = require(path.join(ROOT, "lib", "ops"));
  const rt = require(path.join(ROOT, "lib", "runtime"));

  if (pos[0] === "history") {
    const rows = await updates.history({ org_id: flags.org || null, rt });
    emit({ ok: true, updates: rows });
    out(bold("\nApplied updates\n"));
    if (!rows.length) out(dim("  none\n"));
    for (const r of rows) out(`  ${r.created_at}  ${bold(r.bundle_id)} v${r.version.padEnd(10)} ${r.status.padEnd(12)} ${dim(r.id)}`);
    out("");
    return 0;
  }

  if (pos[0] === "rollback") {
    const id = pos[1];
    if (!id) return die("usage: guardian update rollback <UPDATE_ID>", 2);
    let res;
    try { res = await updates.rollback(id, { actor: flags.actor || "guardian-cli", rt, ops }); }
    catch (e) { return die(e.message); }
    emit({ ok: true, ...res });
    out(`\n${green("✓")} rolled back ${bold(`${res.bundle_id} v${res.version}`)} — ${res.undone.length} item(s) reversed\n`);
    return 0;
  }

  const target = pos[0];
  if (!target) return die("usage: guardian update <BUNDLE.gos> | history | rollback <ID>", 2);

  if (flags["dry-run"]) {
    let plan;
    try { plan = updates.inspect(target, { trust: trustFrom(flags) }); }
    catch (e) { return die(e.message); }
    emit({ ok: true, dry_run: true, release: plan.release, policies: plan.policies.map((p) => p.name), packs: plan.packs.map((p) => p.id), migrations: plan.migrations });
    out(bold(`\n${plan.manifest.id} v${plan.release} — dry run (nothing applied)\n`));
    out(`  signature   ${plan.report.alg}${plan.report.key_id ? ` (${plan.report.key_id})` : ""}`);
    out(`  policies    ${plan.policies.map((p) => p.name).join(", ") || dim("none")}`);
    out(`  packs       ${plan.packs.map((p) => `${p.id} (${p.projections})`).join(", ") || dim("none")}`);
    out(`  migrations  ${plan.migrations.map((m) => m.path).join(", ") || dim("none")}`);
    if (plan.notes) out(`\n${dim(plan.notes.trim())}`);
    out("");
    return 0;
  }

  let res;
  try {
    res = await updates.apply(target, {
      org_id: flags.org || (await defaultOrg()), actor: flags.actor || "guardian-cli",
      trust: trustFrom(flags), rt, ops,
    });
  } catch (e) { return die(e.message); }
  emit({ ok: res.status === "applied", ...res });
  const mark = res.status === "applied" ? green("✓") : yellow("!");
  out(`\n${mark} ${bold(`${res.bundle_id} v${res.version}`)} — ${res.status}`);
  for (const a of res.applied) {
    out(`  ${a.status === "error" ? red("✗") : green("✓")} ${a.kind} ${a.name || a.pack_id}${a.error ? red(` — ${a.error}`) : ` (${a.status})`}`);
  }
  if (res.migrations_outstanding && res.migrations_outstanding.length) {
    out(`\n  ${yellow("migrations outstanding")} — ${res.migrations_note}`);
    for (const m of res.migrations_outstanding) out(`    ${m.path}  sha256:${m.sha256.slice(0, 16)}…`);
  }
  out(dim(`\n  roll back with: guardian update rollback ${res.id}\n`));
  return res.status === "applied" ? 0 : 1;
}

async function cmdVerify(pos, flags) {
  // Verifying a FILE needs nothing but the bundle format — useful on a laptop.
  if (pos[0]) {
    let b;
    try { b = fmt.read(pos[0]); } catch (e) { return die(e.message); }
    const report = fmt.verify(b, { trust: trustFrom(flags), requireSignature: profiles.requiresSignedBundles() });
    emit({ ok: report.ok, ...report, manifest: { id: b.manifest.id, kind: b.manifest.kind, version: b.manifest.version } });
    if (report.ok) out(`\n${green("✓")} ${bold(pos[0])} — ${b.manifest.kind} ${b.manifest.id} v${b.manifest.version}, ${report.alg} signature verified\n`);
    else { out(`\n${red("✗")} ${bold(pos[0])} FAILED verification:`); for (const e of report.errors) out(`  - ${e}`); out(""); }
    return report.ok ? 0 : 1;
  }

  const res = await sovereign.verify.run({ org_id: flags.org || (await defaultOrg()) });
  emit(res);
  out(bold(`\nGuardian OS — deployment verification (${res.profile})\n`));
  for (const ch of res.checks) {
    out(`  ${MARK[ch.status]} ${bold(ch.title.padEnd(26))} ${ch.detail}`);
  }
  const s = res.summary;
  out(`\n  ${s.pass} passed · ${s.warn} warning(s) · ${s.fail} failure(s)`);
  out(res.ok ? green("\n  Deployment verified.\n") : red("\n  Deployment NOT verified — resolve the failures above.\n"));
  return res.ok ? 0 : 1;
}

async function cmdExport(pos, flags) {
  if (pos[0] !== "evidence") return die("usage: guardian export evidence <OUT_DIR>", 2);
  const dest = pos[1] || flags.out;
  if (!dest) return die("an output directory is required", 2);
  const rt = require(path.join(ROOT, "lib", "runtime"));
  const src = rt.store.DATA_DIR;
  if (rt.store.backend() !== "file") return die("this deployment stores evidence in the cloud — export from there, not from the local data directory");
  if (!fs.existsSync(src)) return die(`no local evidence store at ${src}`);
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  const n = (function count(d) { let t = 0; for (const it of fs.readdirSync(d, { withFileTypes: true })) t += it.isDirectory() ? count(path.join(d, it.name)) : 1; return t; })(dest);
  emit({ ok: true, from: src, to: dest, files: n });
  out(`\n${green("✓")} exported ${n} file(s) from ${src} → ${bold(dest)}`);
  out(dim("  this is the full local evidence store: decisions, evidence ledger, reports and deliverables\n"));
  return 0;
}

/** The single provisioned enterprise, when there is exactly one. */
async function defaultOrg() {
  try {
    const rt = require(path.join(ROOT, "lib", "runtime"));
    const orgs = await rt.store.findOptional("orgs", {});
    return orgs.length === 1 ? orgs[0].id : null;
  } catch { return null; }
}

// ── Help ────────────────────────────────────────────────────────────────────
function usage() {
  out(`
${bold("guardian")} — Guardian OS Sovereign operator CLI

${bold("Deployment")}
  guardian profile                        show the active deployment profile
  guardian profile list                   every profile and what it configures
  guardian verify [BUNDLE]                verify the deployment, or one bundle file

${bold("Signing")}
  guardian keygen [--out DIR]             create an Ed25519 signing identity

${bold("Bundles")}
  guardian bundle policies SRC --out F    build a signed Ω policy bundle
  guardian bundle update   SRC --out F    build a signed offline update package
  guardian install BUNDLE [--to DIR]      install a policy bundle for the engine

${bold("Industry packs")}
  guardian pack list                      packs available in this build
  guardian pack export ID|--all --out D   publish signed pack bundles
  guardian pack install BUNDLE [--org O]  install a pack from signed media
  guardian pack uninstall ID [--org O]    remove a pack (rolls its policies back)

${bold("Updates")}
  guardian update BUNDLE.gos [--dry-run]  apply a signed offline update
  guardian update history                 applied updates, newest first
  guardian update rollback ID             reverse an applied update

${bold("Evidence")}
  guardian export evidence OUT_DIR        copy the local evidence store off the box

${bold("Common flags")}
  --sign-key KEY.pem  --key-id ID  --hmac-key SECRET   signing
  --trust DIR         trust store to verify against
  --org ORG_ID        target enterprise
  --json              machine-readable output
  --unsigned          allow building an unsigned bundle (refused by default)

Environment: GUARDIAN_PROFILE · GUARDIAN_POLICY_BUNDLE · GUARDIAN_TRUST_DIR ·
GUARDIAN_BUNDLE_HMAC_KEY · GUARDIAN_IMMUTABLE · RUNTIME_DATA_DIR
`);
}

// ── Entry point ─────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const { flags, positional } = parse(argv);
  JSON_OUT = !!flags.json;
  const cmd = positional.shift();

  if (!cmd || cmd === "help" || flags.help) { usage(); return 0; }
  switch (cmd) {
    case "profile": return cmdProfile(positional, flags);
    case "keygen": return cmdKeygen(positional, flags);
    case "bundle": return cmdBundle(positional, flags);
    case "install": return cmdInstall(positional, flags);
    case "pack": return cmdPack(positional, flags);
    case "update": return cmdUpdate(positional, flags);
    case "verify": return cmdVerify(positional, flags);
    case "export": return cmdExport(positional, flags);
    default: usage(); return die(`unknown command "${cmd}"`, 2);
  }
}

main().then((code) => process.exit(code || 0)).catch((e) => die(e && e.stack ? e.stack : e));
