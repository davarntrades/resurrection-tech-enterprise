/* ============================================================================
 * Guardian OS Sovereign — the signed bundle format (`guardian.bundle/1`).
 *
 * ONE format carries every offline artefact: policy bundles, Industry
 * Intelligence Packs, and update packages. A bundle is content-addressed and
 * signed, so an air-gapped operator can prove — with no network, no vendor, and
 * no trust in the USB stick that carried it — that what they are installing is
 * exactly what was published.
 *
 *   manifest.json   kind · id · version · created_at · entries[] · digest
 *   manifest.sig    detached signature over the CANONICAL manifest bytes
 *   <entries>       the payload files, each pinned by sha256 in the manifest
 *
 * Two shapes, same bytes:
 *   • a DIRECTORY  — `guardian install ./policies/`   (human-inspectable)
 *   • a `.gos` FILE — `guardian update v1.4.gos`      (one file to carry)
 * The .gos envelope is JSON with base64 payloads rather than tar/gzip so that
 * unpacking needs nothing but the standard library, on any OS, forever.
 *
 * VERIFICATION IS THREE INDEPENDENT LAYERS, all of which must pass:
 *   1. every entry's bytes hash to the sha256 recorded in the manifest;
 *   2. the manifest's `digest` equals the recomputed digest of the entry list
 *      (so entries cannot be added or removed);
 *   3. the detached signature verifies against a key in the local trust store
 *      (so the manifest itself cannot be rewritten).
 * Under a profile with require_signed_bundles, `alg: "none"` is REFUSED — an
 * unsigned bundle is not a weaker bundle, it is not installable at all.
 *
 * Signature algorithms
 *   ed25519       asymmetric, the default. The signing key never has to exist
 *                 inside the sovereign environment — only the 32-byte public
 *                 key does. The engine verifies it with pure-stdlib Python
 *                 (governance-service/ed25519_verify.py), so the air-gapped
 *                 runtime still takes zero dependencies.
 *   hmac-sha256   symmetric, for operators who prefer a pre-shared secret.
 *                 Weaker supply-chain property (a verifier can also forge) —
 *                 documented as such in docs/SOVEREIGN.md.
 *
 * Node stdlib only (`node:crypto`, `node:fs`) — no dependency reaches a
 * sovereign install.
 * ========================================================================== */
"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const FORMAT = "guardian.bundle/1";
const KINDS = ["policies", "pack", "update"];
const ALGS = ["ed25519", "hmac-sha256", "none"];
const MANIFEST_FILE = "manifest.json";
const SIGNATURE_FILE = "manifest.sig";
const DEFAULT_TRUST_DIR = ".guardian/trust";

// SPKI DER prefix for a raw 32-byte Ed25519 public key (RFC 8410).
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

class BundleError extends Error {}

// ── Canonical encoding ──────────────────────────────────────────────────────
// Signatures are taken over CANONICAL bytes, never over whatever a JSON
// serialiser happened to emit: object keys sorted, no insignificant whitespace.
// Two independently-built copies of the same bundle therefore sign identically,
// which is what makes deployments deterministic and diffable.
function canonical(v) {
  if (v === null || typeof v === "number" || typeof v === "boolean" || typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v === undefined) return "null";
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
}
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const toBuf = (x) => (Buffer.isBuffer(x) ? x : Buffer.from(String(x), "utf8"));

/** The exact bytes a signature covers: the manifest minus its own signature block. */
function manifestBytes(manifest) {
  const { signature, ...rest } = manifest || {};   // eslint-disable-line no-unused-vars
  return Buffer.from(canonical(rest), "utf8");
}

/** The digest that pins the entry LIST (so entries cannot be added or dropped). */
function entriesDigest(entries) {
  return sha256(canonical((entries || []).map((e) => ({ path: e.path, sha256: e.sha256, bytes: e.bytes }))));
}

// ── Keys ────────────────────────────────────────────────────────────────────

/** Generate an Ed25519 signing identity. The private key stays with the
 *  publisher; only `public_key` is provisioned into the sovereign trust store. */
function keygen({ key_id } = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(SPKI_ED25519_PREFIX.length);
  const pub = raw.toString("base64");
  return {
    key_id: key_id || `gos-${sha256(raw).slice(0, 12)}`,
    alg: "ed25519",
    public_key: pub,
    private_key_pem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
}

function publicKeyObject(base64Raw) {
  const raw = Buffer.from(String(base64Raw), "base64");
  if (raw.length !== 32) throw new BundleError(`ed25519 public key must be 32 bytes, got ${raw.length}`);
  return crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, raw]), format: "der", type: "spki" });
}

/**
 * Load the local trust store — the ONLY authority a sovereign install consults.
 *   <dir>/<key_id>.pub   base64 raw Ed25519 public key (comments with # ignored)
 *   GUARDIAN_BUNDLE_HMAC_KEY   pre-shared secret for hmac-sha256 bundles
 * Absent directory = empty trust store, which means signed bundles fail to
 * verify. That is the correct failure: no trust anchor, no installation.
 */
function loadTrust({ dir, hmacKey } = {}) {
  // A relative default rather than path.join(process.cwd(), …): it resolves
  // identically at runtime, and keeps the Next.js file tracer from concluding
  // that this module reads arbitrary project paths and pulling the whole repo
  // into the serverless bundle.
  const trustDir = dir || process.env.GUARDIAN_TRUST_DIR || DEFAULT_TRUST_DIR;
  const keys = {};
  let files = [];
  try { files = fs.readdirSync(/*turbopackIgnore: true*/ trustDir); } catch { files = []; }
  for (const f of files) {
    if (!f.endsWith(".pub")) continue;
    try {
      const body = fs.readFileSync(path.join(/*turbopackIgnore: true*/ trustDir, f), "utf8")
        .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).join("");
      if (body) keys[f.slice(0, -4)] = body;
    } catch { /* an unreadable key is simply not trusted */ }
  }
  const hmac = hmacKey !== undefined ? hmacKey : (process.env.GUARDIAN_BUNDLE_HMAC_KEY || null);
  return { dir: trustDir, keys, hmac_key: hmac || null, count: Object.keys(keys).length };
}

// ── Build ───────────────────────────────────────────────────────────────────

/**
 * Build a bundle in memory.
 *   files  { "<relative/path>": Buffer | string }  — the payload
 *   sign   { alg, key_id, private_key_pem } | { alg:"hmac-sha256", key_id, secret } | null
 * Returns { manifest, files } where manifest.signature is the detached block.
 */
function build({ kind, id, version, files, created_at, produced_by, requires, sign = null, metadata = null }) {
  if (!KINDS.includes(kind)) throw new BundleError(`bundle kind must be one of ${KINDS.join(", ")}`);
  if (!String(id || "").trim()) throw new BundleError("bundle id is required");
  if (!String(version || "").trim()) throw new BundleError("bundle version is required");
  const payload = files || {};
  const paths = Object.keys(payload).sort();
  if (!paths.length) throw new BundleError("a bundle must contain at least one entry");
  for (const p of paths) assertSafePath(p);

  const entries = paths.map((p) => {
    const buf = toBuf(payload[p]);
    return { path: p, sha256: sha256(buf), bytes: buf.length };
  });

  const manifest = {
    format: FORMAT,
    kind,
    id: String(id),
    version: String(version),
    created_at: created_at || new Date().toISOString(),
    produced_by: produced_by || "guardian-cli/1",
    requires: requires || {},
    metadata: metadata || {},
    entries,
    digest: entriesDigest(entries),
  };
  manifest.signature = signManifest(manifest, sign);
  return { manifest, files: Object.fromEntries(paths.map((p) => [p, toBuf(payload[p])])) };
}

function signManifest(manifest, sign) {
  const bytes = manifestBytes(manifest);
  if (!sign || sign.alg === "none" || !sign.alg) return { alg: "none", key_id: null, value: null };
  if (sign.alg === "ed25519") {
    if (!sign.private_key_pem) throw new BundleError("ed25519 signing requires private_key_pem");
    const key = crypto.createPrivateKey(sign.private_key_pem);
    return { alg: "ed25519", key_id: sign.key_id || null, value: crypto.sign(null, bytes, key).toString("base64") };
  }
  if (sign.alg === "hmac-sha256") {
    if (!sign.secret) throw new BundleError("hmac-sha256 signing requires a secret");
    return { alg: "hmac-sha256", key_id: sign.key_id || null, value: crypto.createHmac("sha256", String(sign.secret)).update(bytes).digest("base64") };
  }
  throw new BundleError(`unsupported signature algorithm ${JSON.stringify(sign.alg)}`);
}

// Entry paths are attacker-influenced once a bundle leaves our hands: reject
// absolute paths, traversal, and Windows drive letters so `guardian install`
// can never write outside its target directory.
function assertSafePath(p) {
  const s = String(p);
  if (!s || s !== s.trim()) throw new BundleError(`unsafe entry path ${JSON.stringify(p)}`);
  if (path.isAbsolute(s) || s.startsWith("/") || s.startsWith("\\") || /^[a-zA-Z]:/.test(s)) throw new BundleError(`entry path must be relative: ${s}`);
  if (s.split(/[\\/]/).some((seg) => seg === ".." || seg === "")) throw new BundleError(`entry path must not traverse: ${s}`);
  return s;
}

// ── Verify ──────────────────────────────────────────────────────────────────

/**
 * Verify a bundle against a trust store. Returns a REPORT, never throws on a
 * bad bundle — the caller decides what to do with an untrusted artefact, and
 * `guardian verify` needs every failure reason at once, not just the first.
 *
 *   { ok, signed, alg, key_id, errors[], checked: { entries, digest, signature } }
 */
function verify(bundle, { trust = null, requireSignature = false } = {}) {
  const errors = [];
  const t = trust || loadTrust();
  const manifest = bundle && bundle.manifest;
  const files = (bundle && bundle.files) || {};
  const checked = { entries: false, digest: false, signature: false };

  if (!manifest || typeof manifest !== "object") return { ok: false, signed: false, alg: null, key_id: null, errors: ["bundle has no manifest"], checked };
  if (manifest.format !== FORMAT) errors.push(`unsupported bundle format ${JSON.stringify(manifest.format)} (expected ${FORMAT})`);
  if (!KINDS.includes(manifest.kind)) errors.push(`unknown bundle kind ${JSON.stringify(manifest.kind)}`);

  // 1. Content integrity — every entry's bytes hash to the recorded digest.
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  if (!entries.length) errors.push("manifest lists no entries");
  for (const e of entries) {
    let safe = true;
    try { assertSafePath(e.path); } catch (err) { errors.push(err.message); safe = false; }
    if (!safe) continue;
    const buf = files[e.path];
    if (buf === undefined) { errors.push(`missing entry ${e.path}`); continue; }
    const actual = sha256(toBuf(buf));
    if (actual !== e.sha256) errors.push(`entry ${e.path} content does not match its manifest hash`);
    if (toBuf(buf).length !== e.bytes) errors.push(`entry ${e.path} byte length does not match the manifest`);
  }
  for (const p of Object.keys(files)) {
    if (!entries.some((e) => e.path === p)) errors.push(`unlisted file ${p} present in the bundle`);
  }
  checked.entries = true;

  // 2. Entry-list integrity — entries cannot be added or removed.
  if (entriesDigest(entries) !== manifest.digest) errors.push("manifest digest does not match its entry list");
  checked.digest = true;

  // 3. Signature — the manifest itself cannot be rewritten.
  const sig = manifest.signature || { alg: "none" };
  const alg = sig.alg || "none";
  if (!ALGS.includes(alg)) errors.push(`unsupported signature algorithm ${JSON.stringify(alg)}`);
  const signed = alg !== "none";
  if (!signed && requireSignature) {
    errors.push("bundle is unsigned and this deployment profile requires a verified signature");
  } else if (signed) {
    const bytes = manifestBytes(manifest);
    if (alg === "ed25519") {
      const pub = sig.key_id ? t.keys[sig.key_id] : null;
      if (!pub) errors.push(`no trusted key ${JSON.stringify(sig.key_id)} in the trust store (${t.dir})`);
      else {
        let good = false;
        try { good = crypto.verify(null, bytes, publicKeyObject(pub), Buffer.from(String(sig.value || ""), "base64")); }
        catch (e) { errors.push(`signature verification failed: ${e.message}`); }
        if (!good) errors.push("ed25519 signature does not verify against the trusted key");
      }
    } else if (alg === "hmac-sha256") {
      if (!t.hmac_key) errors.push("no HMAC key configured (set GUARDIAN_BUNDLE_HMAC_KEY)");
      else {
        const expect = crypto.createHmac("sha256", String(t.hmac_key)).update(bytes).digest();
        const got = Buffer.from(String(sig.value || ""), "base64");
        if (expect.length !== got.length || !crypto.timingSafeEqual(expect, got)) errors.push("hmac-sha256 signature does not verify");
      }
    }
  }
  checked.signature = true;

  return { ok: errors.length === 0, signed, alg, key_id: sig.key_id || null, errors, checked };
}

// ── Directory form ──────────────────────────────────────────────────────────

function writeDir(bundle, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const { signature, ...rest } = bundle.manifest;
  fs.writeFileSync(path.join(dir, MANIFEST_FILE), JSON.stringify(bundle.manifest, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, SIGNATURE_FILE), JSON.stringify(signature, null, 2) + "\n");
  void rest;
  for (const [p, buf] of Object.entries(bundle.files)) {
    const abs = path.join(dir, assertSafePath(p));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, toBuf(buf));
  }
  return dir;
}

/** Read a bundle directory. Only files LISTED in the manifest are loaded, so a
 *  stray file dropped into the directory shows up as an integrity error rather
 *  than being silently installed. */
function readDir(dir) {
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(path.join(/*turbopackIgnore: true*/ dir, MANIFEST_FILE), "utf8")); }
  catch (e) { throw new BundleError(`cannot read ${path.join(dir, MANIFEST_FILE)}: ${e.message}`); }
  // A detached manifest.sig wins over an embedded block, so re-signing a
  // bundle in place is a single-file operation.
  try {
    const sig = JSON.parse(fs.readFileSync(path.join(/*turbopackIgnore: true*/ dir, SIGNATURE_FILE), "utf8"));
    if (sig && typeof sig === "object") manifest.signature = sig;
  } catch { /* embedded signature (or none) */ }
  const files = {};
  const listed = new Set((manifest.entries || []).map((e) => e.path));
  for (const p of listed) {
    try { files[p] = fs.readFileSync(path.join(/*turbopackIgnore: true*/ dir, p)); } catch { /* reported as a missing entry by verify() */ }
  }
  // Surface unlisted payload files so verify() can reject them.
  for (const p of walk(dir)) {
    if (p === MANIFEST_FILE || p === SIGNATURE_FILE || listed.has(p)) continue;
    files[p] = fs.readFileSync(path.join(/*turbopackIgnore: true*/ dir, p));
  }
  return { manifest, files };
}

function walk(root, rel = "") {
  const out = [];
  let items = [];
  try { items = fs.readdirSync(path.join(/*turbopackIgnore: true*/ root, rel), { withFileTypes: true }); } catch { return out; }
  for (const it of items) {
    const r = rel ? `${rel}/${it.name}` : it.name;
    if (it.isDirectory()) out.push(...walk(root, r));
    else out.push(r);
  }
  return out;
}

// ── Single-file `.gos` form ─────────────────────────────────────────────────

/** Serialise a bundle to one portable `.gos` file (JSON + base64 payloads). */
function pack(bundle) {
  return JSON.stringify({
    format: FORMAT,
    manifest: bundle.manifest,
    files: Object.fromEntries(Object.entries(bundle.files).map(([p, b]) => [p, toBuf(b).toString("base64")])),
  }, null, 2) + "\n";
}

function unpack(text) {
  let env;
  try { env = JSON.parse(String(text)); } catch (e) { throw new BundleError(`not a valid .gos bundle: ${e.message}`); }
  if (!env || env.format !== FORMAT) throw new BundleError(`not a ${FORMAT} bundle`);
  const files = Object.fromEntries(Object.entries(env.files || {}).map(([p, b]) => [p, Buffer.from(String(b), "base64")]));
  return { manifest: env.manifest, files };
}

const writeFile = (bundle, file) => (fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }), fs.writeFileSync(file, pack(bundle)), file);
const readFile = (file) => unpack(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8"));

/** Read a bundle from either shape — a directory or a `.gos` file. */
function read(target) {
  const stat = fs.statSync(target);
  return stat.isDirectory() ? readDir(target) : readFile(target);
}

/** Decode a JSON entry from a verified bundle. */
function entryJSON(bundle, entryPath) {
  const buf = bundle.files[entryPath];
  if (buf === undefined) throw new BundleError(`bundle has no entry ${entryPath}`);
  return JSON.parse(toBuf(buf).toString("utf8"));
}

module.exports = {
  FORMAT, KINDS, ALGS, MANIFEST_FILE, SIGNATURE_FILE, BundleError,
  canonical, sha256, manifestBytes, entriesDigest, assertSafePath,
  keygen, loadTrust, publicKeyObject,
  build, signManifest, verify,
  writeDir, readDir, pack, unpack, writeFile, readFile, read, entryJSON,
};
