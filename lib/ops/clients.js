/* ============================================================================
 * Operations Agent — external client authentication (OpenClaw-ready).
 *
 * Scoped, hashed API keys for read-mostly external clients (OpenClaw, Slack,
 * Teams, Discord, WhatsApp, Telegram bridges…). Mirrors the runtime api_keys
 * pattern: the plaintext key (`opsk_...`) is shown once at issue time; only
 * its sha256 is stored. Scopes gate what a client may reach:
 *
 *   briefing        GET /api/ops/briefing
 *   status          GET /api/ops/status, /api/ops/dashboard
 *   proposals:read  GET /api/ops/proposals
 *   events:write    POST /api/ops/events (webhook-style ingestion)
 *
 * Clients can NEVER approve proposals or trigger executions — approval stays
 * operator-only (Control Room session / admin key).
 * ============================================================================ */
"use strict";
const crypto = require("node:crypto");
const rt = require("../runtime");
const store = rt.store;

const SCOPES = ["briefing", "status", "proposals:read", "events:write"];
const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

async function issue({ label, scopes = ["briefing", "status"] }) {
  const clean = (scopes || []).filter((s) => SCOPES.includes(s));
  if (!clean.length) throw new Error(`at least one valid scope required (${SCOPES.join(", ")})`);
  const key = `opsk_${crypto.randomBytes(24).toString("base64url")}`;
  const row = await store.insert("ops_client_keys", {
    key_hash: sha256(key), label: String(label || "client").slice(0, 120),
    scopes: clean, status: "active", last_used_at: null,
  });
  return { id: row.id, key, label: row.label, scopes: clean }; // key shown ONCE
}

async function authenticate(presentedKey, { requireScope } = {}) {
  if (!presentedKey || !String(presentedKey).startsWith("opsk_")) return { ok: false, error: "client key required" };
  const row = await store.findOne("ops_client_keys", { key_hash: sha256(presentedKey) });
  if (!row || row.status !== "active") return { ok: false, error: "invalid or revoked client key" };
  if (requireScope && !(row.scopes || []).includes(requireScope)) {
    return { ok: false, error: `scope ${requireScope} required` };
  }
  store.update("ops_client_keys", row.id, { last_used_at: store.nowISO() }).catch(() => {});
  return { ok: true, client: { id: row.id, label: row.label, scopes: row.scopes } };
}

async function revoke(id) { await store.update("ops_client_keys", id, { status: "revoked" }); }

async function list() {
  const rows = await store.find("ops_client_keys", {});
  return rows.map((r) => ({ id: r.id, label: r.label, scopes: r.scopes, status: r.status, created_at: r.created_at, last_used_at: r.last_used_at }));
}

module.exports = { SCOPES, issue, authenticate, revoke, list };
