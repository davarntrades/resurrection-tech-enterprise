/* ============================================================================
 * Runtime Governance — audit deliverables + secure delivery (Control Room).
 *
 * The shared store the operator dashboard reads. The existing audit generator
 * (scripts/delivery-kit.cjs, run in the console where Chromium lives) produces a
 * deliverables/<slug>/ directory; `publishPack()` uploads those files to object
 * storage and records them under a customer environment. The Control Room then
 * lists / previews / downloads them and mints secure, expiring, revocable share
 * links served credential-free at /api/runtime/share/<token>.
 *
 * The generator is NOT rebuilt here — this only wires its output into the store.
 * ============================================================================ */
"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const store = require("./store");

// The 48-Hour Audit deliverable set (label shown in the dashboard).
const KINDS = {
  "audit.html": "Branded HTML report",
  "audit.md": "Markdown",
  "audit.pdf": "Branded PDF",
  "executive-report.html": "Branded HTML report",
  "executive-report.md": "Markdown",
  "executive-report.pdf": "Branded PDF",
  "run-summary.json": "Run summary (JSON)",
};
const MIME = {
  ".html": "text/html; charset=utf-8", ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf", ".json": "application/json",
  ".txt": "text/plain; charset=utf-8", ".csv": "text/csv",
};
const mimeFor = (f) => MIME[path.extname(f).toLowerCase()] || "application/octet-stream";
const DELIVERABLE_RE = /\.(html|md|pdf|json|csv|txt)$/i;

// Publish a generated deliverables directory under a customer environment.
async function publishPack({ org_id, environment_id, name, reference, dir, summary = null, files = null }) {
  if (!org_id || !environment_id) throw new Error("org_id and environment_id are required");
  if (!dir || !fs.existsSync(dir)) throw new Error(`deliverables directory not found: ${dir}`);
  const names = (files && files.length ? files : fs.readdirSync(dir)).filter((f) => DELIVERABLE_RE.test(f));
  if (!names.length) throw new Error(`no deliverable files in ${dir}`);

  let sum = summary;
  if (!sum) { try { sum = JSON.parse(fs.readFileSync(path.join(dir, "run-summary.json"), "utf8")); } catch { sum = null; } }

  const pack = await store.insert("audit_packs", { org_id, environment_id, name: name || "48-Hour Audit", reference: reference || null, summary: sum });
  const deliverables = [];
  for (const filename of names.sort()) {
    const bytes = fs.readFileSync(path.join(dir, filename));
    const storage_path = `${org_id}/${environment_id}/${pack.id}/${filename}`;
    await store.storagePut(storage_path, bytes, mimeFor(filename));
    deliverables.push(await store.insert("deliverables", {
      pack_id: pack.id, org_id, environment_id, filename,
      kind: KINDS[filename] || "File", mime: mimeFor(filename), size: bytes.length, storage_path,
    }));
  }
  return { pack, deliverables };
}

// Publish from in-memory files (browser upload / server-generated), not a dir.
// files: [{ filename, bytes(Buffer), mime? }]. Same result as publishPack.
async function publishUploaded({ org_id, environment_id, name, reference, files }) {
  if (!org_id || !environment_id) throw new Error("org_id and environment_id are required");
  const usable = (files || []).filter((f) => f && f.filename && DELIVERABLE_RE.test(f.filename) && f.bytes);
  if (!usable.length) throw new Error("no deliverable files (expected .html/.md/.pdf/.json)");
  let sum = null;
  const rs = usable.find((f) => f.filename === "run-summary.json");
  if (rs) { try { sum = JSON.parse(Buffer.from(rs.bytes).toString("utf8")); } catch { sum = null; } }
  const pack = await store.insert("audit_packs", { org_id, environment_id, name: name || "48-Hour Audit", reference: reference || null, summary: sum });
  const deliverables = [];
  for (const f of usable) {
    const bytes = Buffer.isBuffer(f.bytes) ? f.bytes : Buffer.from(f.bytes);
    const storage_path = `${org_id}/${environment_id}/${pack.id}/${f.filename}`;
    await store.storagePut(storage_path, bytes, f.mime || mimeFor(f.filename));
    deliverables.push(await store.insert("deliverables", {
      pack_id: pack.id, org_id, environment_id, filename: f.filename,
      kind: KINDS[f.filename] || "File", mime: f.mime || mimeFor(f.filename), size: bytes.length, storage_path,
    }));
  }
  return { pack, deliverables };
}

async function listPacks({ org_id, environment_id } = {}) {
  const where = {};
  if (org_id) where.org_id = org_id;
  if (environment_id) where.environment_id = environment_id;
  const packs = (await store.find("audit_packs", where)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const out = [];
  for (const p of packs) {
    const dels = (await store.find("deliverables", { pack_id: p.id })).sort((a, b) => String(a.filename).localeCompare(String(b.filename)));
    out.push({ ...p, deliverables: dels });
  }
  return out;
}

async function getDeliverable(id) { return store.findOne("deliverables", { id }); }
async function readBytes(deliverable) { return store.storageGet(deliverable.storage_path); }

// Store an ad-hoc file (not part of an audit pack — e.g. a rendered report) and
// mint a secure share for it in one step. pack_id is null so it never shows in
// the Audit-pack list; it is reachable only via its share link.
async function shareInline({ org_id, environment_id, filename, bytes, mime, expires_in_days = 7, password = null }) {
  const del = await store.insert("deliverables", {
    pack_id: null, org_id, environment_id, filename,
    kind: "Shared", mime: mime || mimeFor(filename), size: bytes.length,
    storage_path: `${org_id}/${environment_id || "_"}/shares/${store.id("s")}/${filename}`,
  });
  await store.storagePut(del.storage_path, bytes, del.mime);
  return createShare({ deliverable_id: del.id, expires_in_days, password });
}

// ── Secure shares — expiring, revocable, optionally password-protected ────────
const shareState = (s) => (s.revoked ? "revoked" : Date.parse(s.expires_at) < Date.now() ? "expired" : "active");

async function createShare({ deliverable_id, expires_in_days = 7, password = null }) {
  const del = await getDeliverable(deliverable_id);
  if (!del) throw new Error("deliverable not found");
  const token = crypto.randomBytes(18).toString("base64url");
  const expires_at = new Date(Date.now() + Math.max(1, Number(expires_in_days) || 7) * 86400000).toISOString();
  await store.insert("shares", {
    token, deliverable_id, org_id: del.org_id, filename: del.filename,
    expires_at, password_hash: password ? store.sha256(String(password)) : null, revoked: false, accessed: 0,
  });
  return { token, expires_at, path: `/api/runtime/share/${token}`, filename: del.filename };
}

// Resolve a token → the deliverable bytes, or a typed failure (never throws).
async function resolveShare(token, password) {
  const share = await store.findOne("shares", { token });
  if (!share) return { ok: false, status: 404, error: "not found" };
  const st = shareState(share);
  if (st !== "active") return { ok: false, status: 410, error: st };
  if (share.password_hash && store.sha256(String(password || "")) !== share.password_hash) return { ok: false, status: 401, error: "password required" };
  const del = await getDeliverable(share.deliverable_id);
  if (!del) return { ok: false, status: 404, error: "deliverable missing" };
  store.update("shares", share.id, { accessed: (share.accessed || 0) + 1, last_accessed_at: store.nowISO() }).catch(() => {});
  let bytes; try { bytes = await readBytes(del); } catch (e) { return { ok: false, status: 500, error: (e && e.message) || "read failed" }; }
  return { ok: true, deliverable: del, bytes };
}

async function revokeShare(token) { const s = await store.findOne("shares", { token }); if (s) await store.update("shares", s.id, { revoked: true }); return !!s; }
async function listShares({ org_id, deliverable_id } = {}) {
  const where = {};
  if (org_id) where.org_id = org_id;
  if (deliverable_id) where.deliverable_id = deliverable_id;
  const rows = await store.find("shares", where);
  return rows.map((s) => ({ id: s.id, token: s.token, deliverable_id: s.deliverable_id, filename: s.filename, expires_at: s.expires_at, accessed: s.accessed || 0, protected: !!s.password_hash, state: shareState(s), created_at: s.created_at }));
}

module.exports = { KINDS, MIME, mimeFor, publishPack, publishUploaded, listPacks, getDeliverable, readBytes, shareInline, createShare, resolveShare, revokeShare, listShares, shareState };
