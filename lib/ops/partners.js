/* ============================================================================
 * Guardian OS — Partner / MSSP registry.
 *
 * Security partners + managed-service providers: their linked customer orgs,
 * deployments, renewals and health. This is a small AUTHORITATIVE record where
 * none existed (rg_ops_partners) — operator-seeded reference data. The Enterprise
 * Twin and the Partner department PROJECT it read-only; they never mutate it as a
 * side effect of a council cycle. The Partner department reacts to partners that
 * need attention with governed recommendations, through the shared spine.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const store = rt.store;

const HEALTH = ["ok", "watch", "at_risk"];

function shape(p) {
  if (!p) return null;
  return {
    id: p.id, name: p.name || p.id, kind: p.kind || "mssp", status: p.status || "active",
    org_ids: Array.isArray(p.org_ids) ? p.org_ids : [], deployments: p.deployments || 0,
    renewals_due: p.renewals_due || 0, health: HEALTH.includes(p.health) ? p.health : "ok",
    notes: p.notes || "", created_at: p.created_at, updated_at: p.updated_at || p.created_at,
  };
}

/** Register / update a partner (operator reference data — not a governed action). */
async function register({ name, kind = "mssp", status = "active", org_ids = [], deployments = 0, renewals_due = 0, health = "ok", notes = "" }) {
  const row = await store.insert("ops_partners", { name, kind, status, org_ids, deployments, renewals_due, health, notes, updated_at: store.nowISO() });
  return shape(row);
}

async function get(id) { return shape(await store.findOne("ops_partners", { id })); }

async function list() {
  const rows = await store.find("ops_partners", {}).catch(() => []);
  rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return rows.map(shape);
}

/** Partners needing attention: unhealthy or with renewals due. Deterministic. */
async function needingAttention() {
  const rows = await list();
  return rows.filter((p) => p.health !== "ok" || p.renewals_due > 0)
    .map((p) => ({ id: p.id, name: p.name, kind: p.kind, health: p.health, renewals_due: p.renewals_due, deployments: p.deployments,
      reason: p.health !== "ok" ? `partner health ${p.health}` : `${p.renewals_due} renewal(s) due` }));
}

async function summary() {
  const rows = await list();
  const by_health = { ok: 0, watch: 0, at_risk: 0 };
  let deployments = 0, renewals_due = 0;
  for (const p of rows) { if (by_health[p.health] !== undefined) by_health[p.health] += 1; deployments += p.deployments; renewals_due += p.renewals_due; }
  return { total: rows.length, by_health, deployments, renewals_due };
}

module.exports = { register, get, list, needingAttention, summary, shape, HEALTH };
