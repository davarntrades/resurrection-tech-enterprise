/* ============================================================================
 * Guardian OS — Enterprise estate entities.
 *
 * The identity, AI estate and trust architecture of a provisioned enterprise,
 * stored as flexible entities (layer + kind + attrs + refs). Relationships are
 * `refs` (ids of related entities) — the digital-twin graphs are DERIVED from
 * these, never a second copy. Write-side of the provisioning workflow; the twin
 * and entgraph are read-only consumers.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const store = rt.store;

const LAYERS = ["identity", "estate", "trust"];
const KINDS = {
  identity: ["business_unit", "environment", "region", "compliance_requirement"],
  estate: ["ai_system", "model", "agent", "mcp_server", "api", "tool", "integration"],
  trust: ["trust_boundary", "identity_provider", "approver", "operator", "risk_zone", "critical_system", "protected_asset"],
};

function shape(e) {
  if (!e) return null;
  return {
    id: e.id, org_id: e.org_id, layer: e.layer, kind: e.kind, name: e.name || e.id,
    attrs: e.attrs || {}, refs: Array.isArray(e.refs) ? e.refs : [], seeded: !!e.seeded, created_at: e.created_at,
  };
}

async function create({ org_id, layer, kind, name, attrs = {}, refs = [], seeded = false }) {
  const row = await store.insert("enterprise_entities", { org_id, layer, kind, name, attrs, refs, seeded });
  return shape(row);
}

/** Bulk create; auto-mapping of refs happens in the caller (provisioning). */
async function createMany(list) {
  const out = [];
  for (const e of list) out.push(await create(e));
  return out;
}

async function get(id) { return shape(await store.findOneOptional("enterprise_entities", { id })); }

// Reads degrade to empty when the additive migration has not been run yet (the
// pending migration is reported through store.pendingMigrations); writes above
// still throw. The digital twin therefore renders empty-but-honest rather than
// 500-ing every surface that projects the estate.
async function forOrg(org_id, { layer, kind } = {}) {
  const where = { org_id };
  if (layer) where.layer = layer;
  if (kind) where.kind = kind;
  return (await store.findOptional("enterprise_entities", where)).map(shape);
}

async function setRefs(id, refs) {
  await store.update("enterprise_entities", id, { refs });
  return get(id);
}

async function summary(org_id) {
  const rows = await forOrg(org_id);
  const by_layer = {}; const by_kind = {};
  for (const e of rows) { by_layer[e.layer] = (by_layer[e.layer] || 0) + 1; by_kind[e.kind] = (by_kind[e.kind] || 0) + 1; }
  return { total: rows.length, by_layer, by_kind, seeded: rows.filter((e) => e.seeded).length };
}

module.exports = { LAYERS, KINDS, create, createMany, get, forOrg, setRefs, summary, shape };
