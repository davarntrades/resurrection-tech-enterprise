/* ============================================================================
 * Guardian OS — Policy Engineering ledger.
 *
 * GuardianOS's Policy Engineering department produces governance policy — Ω-rule
 * specs, approval chains, escalation paths, playbooks, sector templates — as
 * DRAFTS. A draft is an inert artifact: it changes nothing about the running
 * kernel. "No policy becomes active without approval": activation is a separate,
 * operator-only governed action (activate_policy → ops_unauthorized_policy_
 * activation), and even when authorised the platform only records the AUTHORISED
 * activation — the live kernel edit remains a deliberate human step. The agent
 * never mutates the governance kernel.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const store = rt.store;

const STATUSES = ["draft", "activation_authorized"];

function shape(p) {
  if (!p) return null;
  return {
    id: p.id, kind: p.kind || "omega_rule", title: p.title || "", spec: p.spec || null,
    rationale: p.rationale || "", target_domain: p.target_domain || "enterprise",
    status: p.status || "draft", created_by: p.created_by || null, activated_by: p.activated_by || null,
    created_at: p.created_at, updated_at: p.updated_at || p.created_at,
  };
}

async function draft({ kind, title, spec = null, rationale = "", target_domain = "enterprise", created_by = "policy_engineering" }) {
  const row = await store.insert("ops_policies", {
    kind: kind || "omega_rule", title: title || "untitled policy", spec, rationale,
    target_domain, status: "draft", created_by, activated_by: null, updated_at: store.nowISO(),
  });
  return shape(row);
}

async function get(id) { return shape(await store.findOne("ops_policies", { id })); }

async function list({ status, limit = 100 } = {}) {
  const where = {};
  if (status) where.status = status;
  const rows = await store.find("ops_policies", where);
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return rows.slice(0, Math.max(1, Math.min(500, limit))).map(shape);
}

/** Record an operator-authorised activation. Never edits the kernel itself —
 *  the live rule deployment stays a deliberate human step. */
async function authorizeActivation(id, { actor = "operator" } = {}) {
  const p = await get(id);
  if (!p) throw new Error("policy draft not found");
  await store.update("ops_policies", id, { status: "activation_authorized", activated_by: actor, updated_at: store.nowISO() });
  return get(id);
}

async function summary() {
  const rows = await store.find("ops_policies", {}).catch(() => []);
  const by = { draft: 0, activation_authorized: 0 };
  for (const r of rows) if (by[r.status] !== undefined) by[r.status] += 1;
  return { total: rows.length, by_status: by, drafts: by.draft, pending_activation: by.draft };
}

module.exports = { draft, get, list, authorizeActivation, summary, shape, STATUSES };
