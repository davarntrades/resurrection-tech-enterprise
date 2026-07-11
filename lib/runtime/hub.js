/* ============================================================================
 * Runtime Governance — per-customer Evidence Hub (managed service).
 *
 * One durable, credential-free, revocable link per customer (org) that
 * aggregates ALL of that customer's published audit packs + deliverables +
 * a timeline into a single read-only page. Customers bookmark one URL instead
 * of receiving many separate share links.
 *
 * Operator-only to CREATE/REVOKE (via the admin API); the resolved page and its
 * files are served credential-free and READ-ONLY, scoped strictly to the hub's
 * org. No customer login, no operator surface exposed. Reuses the existing
 * deliverables aggregation + byte-serving. Never throws on the resolve path.
 * ============================================================================ */
"use strict";
const crypto = require("node:crypto");
const store = require("./store");
const deliverables = require("./deliverables");
const admin = require("./admin");

const stateOf = (h) => (h.revoked ? "revoked" : "active");

// The active hub for an org, if any (one durable hub per org).
async function hubForOrg(org_id) {
  const rows = await store.find("hubs", { org_id });
  return rows.find((h) => !h.revoked) || null;
}

// Create (or reuse) the durable hub for an org.
async function createHub({ org_id, name = null }) {
  if (!org_id) throw new Error("org_id is required");
  const existing = await hubForOrg(org_id);
  if (existing) return { token: existing.token, org_id, path: `/evidence/hub/${existing.token}`, created_at: existing.created_at, reused: true };
  const token = crypto.randomBytes(18).toString("base64url");
  const row = await store.insert("hubs", { token, org_id, name, revoked: false, accessed: 0 });
  return { token, org_id, path: `/evidence/hub/${token}`, created_at: row.created_at, reused: false };
}

// Lightweight lookup (no aggregation) — used by the file route to scope access.
async function getHub(token) {
  const h = await store.findOne("hubs", { token });
  return h ? { org_id: h.org_id, name: h.name, state: stateOf(h), created_at: h.created_at } : null;
}

async function revokeHub(token) {
  const h = await store.findOne("hubs", { token });
  if (h) await store.update("hubs", h.id, { revoked: true });
  return !!h;
}

// Rotate the link: revoke the current hub and mint a fresh one for the org.
async function rotateHub(org_id) {
  const cur = await hubForOrg(org_id);
  if (cur) await store.update("hubs", cur.id, { revoked: true });
  return createHub({ org_id });
}

// Read-only aggregated view for the customer hub page. Returns the org + packs
// (each with deliverables) + a timeline, or a typed failure. Never throws.
async function resolveHub(token) {
  const h = await store.findOne("hubs", { token }).catch(() => null);
  if (!h) return { ok: false, status: 404, error: "not found" };
  if (h.revoked) return { ok: false, status: 410, error: "revoked" };
  store.update("hubs", h.id, { accessed: (h.accessed || 0) + 1, last_accessed_at: store.nowISO() }).catch(() => {});
  const org = await admin.getOrg(h.org_id).catch(() => null);
  const packs = await deliverables.listPacks({ org_id: h.org_id }).catch(() => []);
  const timeline = packs
    .map((p) => ({ at: p.created_at, kind: "audit_pack", label: p.name || "Audit pack", reference: p.reference || null }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return {
    ok: true,
    org: org ? { id: org.id, name: org.name } : { id: h.org_id, name: h.org_id },
    packs,
    timeline,
    generated_at: store.nowISO(),
  };
}

module.exports = { hubForOrg, createHub, getHub, revokeHub, rotateHub, resolveHub };
