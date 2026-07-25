/* ============================================================================
 * Guardian OS Sovereign — cross-language bundle proof.
 *
 * The publisher signs bundles in Node (lib/sovereign/bundle.js). The air-gapped
 * engine verifies them in pure-stdlib Python (governance-service/policy_bundle.py
 * + ed25519_verify.py). Those are two independent implementations of the same
 * contract, so "it works" has to be PROVEN, not assumed:
 *
 *   1. CANONICAL   both languages canonicalise the same nasty object to the
 *                  same bytes (unicode, nesting, integral floats, key order) —
 *                  if this drifts, every signature silently stops verifying.
 *   2. ED25519     a Node-signed manifest verifies in Python against nothing
 *                  but the 32-byte public key. The private key never has to
 *                  exist inside the sovereign environment.
 *   3. TAMPER      flipping one byte of a policy, or re-signing with a key that
 *                  is not in the trust store, is rejected on the Python side.
 *   4. ENFORCEMENT the verified bundle compiles into a real DENY-ONLY Ω rule
 *                  that blocks in the engine.
 *
 * Requires python3 + the Morrison engine on PYTHONPATH (ENGINE_PATH, or
 * /tmp/engine in CI). Skips with a clear message if neither is present, so a
 * developer without the engine checked out is told why rather than failing.
 *
 *   node scripts/sovereign/crosslang.test.cjs
 * ========================================================================== */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const bundle = require("../../lib/sovereign/bundle");

const REPO = path.join(__dirname, "..", "..");
const SERVICE = path.join(REPO, "governance-service");

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); }
}

function enginePath() {
  for (const p of [process.env.ENGINE_PATH, "/tmp/engine", path.join(REPO, "..", "Morrison-Runtime-Governance")]) {
    if (p && fs.existsSync(path.join(p, "morrison_governance", "__init__.py"))) return p;
  }
  return null;
}

function python(code, env = {}) {
  const r = spawnSync("python3", ["-c", code], {
    cwd: SERVICE,
    env: { ...process.env, PYTHONPATH: [enginePath(), SERVICE].filter(Boolean).join(":"), PYTHONDONTWRITEBYTECODE: "1", ...env },
    encoding: "utf8",
  });
  if (r.status !== 0) return { ok: false, error: (r.stderr || r.stdout || "").trim() };
  try { return { ok: true, value: JSON.parse(r.stdout.trim().split("\n").pop()) }; }
  catch (e) { return { ok: false, error: `unparseable output: ${r.stdout}` }; }
}

const SPEC = {
  name: "sovereign_crosslang_cap",
  domain: "finance",
  match: { tools: ["wire_transfer"] },
  conditions: { threshold: { field: "amount", op: ">", value: 10000 } },
  severity: "critical",
  description: "Cross-language proof: wire transfers above 10,000 are blocked.",
};

function main() {
  const engine = enginePath();
  console.log("\nSovereign cross-language bundle proof (Node signs → Python verifies)\n");
  if (!engine) {
    console.log("  [SKIP] Morrison engine not found — set ENGINE_PATH to the engine checkout.");
    console.log("         (CI clones it to /tmp/engine; this test is required there.)");
    process.exit(0);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gos-crosslang-"));
  const trustDir = path.join(tmp, "trust");
  fs.mkdirSync(trustDir, { recursive: true });

  // ── 1. Canonical agreement on a deliberately awkward object ───────────────
  const nasty = {
    z: 1, a: "ünïcödé — ✓", nested: { b: [1, 2, { c: null }], a: true },
    integral_float: 3.0, empty_obj: {}, empty_arr: [], quote: 'he said "hi"\n\ttab',
  };
  const nodeCanonical = bundle.canonical(nasty);
  const py = python(
    "import json,sys,policy_bundle as pb\n" +
    `print(json.dumps({"c": pb.canonical(json.loads(${JSON.stringify(JSON.stringify(nasty))}))}))`
  );
  ok(py.ok && py.value.c === nodeCanonical, "canonical encoding is byte-identical in Node and Python",
    py.ok ? { node: nodeCanonical, python: py.value.c } : py.error);

  // ── 2. Node signs an Ed25519 bundle; Python verifies it ───────────────────
  const key = bundle.keygen({ key_id: "crosslang-test" });
  fs.writeFileSync(path.join(trustDir, `${key.key_id}.pub`), `# Guardian OS test key\n${key.public_key}\n`);

  const built = bundle.build({
    kind: "policies", id: "crosslang", version: "1.0.0",
    files: { [`policies/${SPEC.name}.json`]: JSON.stringify({ name: SPEC.name, domain: SPEC.domain, status: "active", version: 1, spec: SPEC }, null, 2) },
    sign: { alg: "ed25519", key_id: key.key_id, private_key_pem: key.private_key_pem },
  });
  ok(built.manifest.signature.alg === "ed25519" && built.manifest.signature.value, "Node produced an ed25519-signed manifest");
  ok(bundle.verify(built, { trust: bundle.loadTrust({ dir: trustDir }), requireSignature: true }).ok, "Node verifies its own bundle");

  const dir = path.join(tmp, "policies-bundle");
  bundle.writeDir(built, dir);

  const verifyPy = (target, extraEnv = {}) => python(
    "import json,policy_bundle as pb\n" +
    `b = pb.read_bundle(${JSON.stringify(target)})\n` +
    `print(json.dumps(pb.verify(b, require_signature=True)))`,
    { GUARDIAN_TRUST_DIR: trustDir, ...extraEnv }
  );

  let r = verifyPy(dir);
  ok(r.ok && r.value.ok === true, "the pure-stdlib Python engine VERIFIES the Node ed25519 signature", r.ok ? r.value.errors : r.error);
  ok(r.ok && r.value.alg === "ed25519" && r.value.key_id === key.key_id, "Python reports the algorithm + trusted key id", r.ok ? r.value : r.error);

  // The single-file .gos form must verify identically.
  const gos = path.join(tmp, "crosslang-1.0.0.gos");
  bundle.writeFile(built, gos);
  r = verifyPy(gos);
  ok(r.ok && r.value.ok === true, "the single-file .gos form verifies identically", r.ok ? r.value.errors : r.error);

  // ── 3. Tamper detection on the Python side ────────────────────────────────
  const tampered = path.join(tmp, "tampered");
  fs.cpSync(dir, tampered, { recursive: true });
  const victim = path.join(tampered, "policies", `${SPEC.name}.json`);
  const body = fs.readFileSync(victim, "utf8").replace('"value": 10000', '"value": 1000000');
  fs.writeFileSync(victim, body);
  r = verifyPy(tampered);
  ok(r.ok && r.value.ok === false && r.value.errors.some((e) => /does not match its manifest hash/.test(e)),
    "raising the threshold inside a signed bundle is caught in Python", r.ok ? r.value.errors : r.error);

  // Re-sign the tampered bundle with an UNTRUSTED key: the signature is
  // internally valid, but the key is not in the trust store.
  const rogue = bundle.keygen({ key_id: "rogue-key" });
  const reSigned = bundle.build({
    kind: "policies", id: "crosslang", version: "1.0.0",
    files: { [`policies/${SPEC.name}.json`]: body },
    sign: { alg: "ed25519", key_id: rogue.key_id, private_key_pem: rogue.private_key_pem },
  });
  const rogueDir = path.join(tmp, "rogue");
  bundle.writeDir(reSigned, rogueDir);
  r = verifyPy(rogueDir);
  ok(r.ok && r.value.ok === false && r.value.errors.some((e) => /no trusted key/.test(e)),
    "a bundle re-signed with an untrusted key is rejected (trust store is the authority)", r.ok ? r.value.errors : r.error);

  // A valid signature from the trusted key over DIFFERENT bytes must not transfer.
  const swapped = path.join(tmp, "swapped");
  fs.cpSync(rogueDir, swapped, { recursive: true });
  fs.copyFileSync(path.join(dir, bundle.SIGNATURE_FILE), path.join(swapped, bundle.SIGNATURE_FILE));
  r = verifyPy(swapped);
  ok(r.ok && r.value.ok === false, "a signature lifted from the good bundle does not validate the tampered one", r.ok ? r.value.errors : r.error);

  // ── 4. The verified bundle actually enforces ──────────────────────────────
  r = python(
    "import json,os,dynamic_rules as dr\n" +
    "rules = dr.active_rules()\n" +
    "out = {'provider': dr.provider(), 'n': len(rules)}\n" +
    "if rules:\n"
    + "    r = rules[0]\n"
    + "    out['blocks'] = r.check({'tool':'wire_transfer','amount':25000})\n"
    + "    out['allows'] = r.check({'tool':'wire_transfer','amount':500})\n"
    + "    out['unrelated'] = r.check({'tool':'send_email'})\n"
    + "print(json.dumps(out))",
    {
      GUARDIAN_TRUST_DIR: trustDir, GUARDIAN_PROFILE: "air_gapped", GUARDIAN_POLICY_BUNDLE: dir,
      SUPABASE_URL: "https://must-never-be-called.example", SUPABASE_SERVICE_ROLE_KEY: "unused",
    }
  );
  ok(r.ok && r.value.provider === "bundle" && r.value.n === 1, "the air-gapped engine loads the bundle (never the DB)", r.ok ? r.value : r.error);
  ok(r.ok && r.value.blocks === true && r.value.allows === false && r.value.unrelated === false,
    "the bundled policy enforces as a DENY-ONLY Ω rule", r.ok ? r.value : r.error);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}

main();
