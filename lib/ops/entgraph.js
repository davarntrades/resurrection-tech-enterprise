/* ============================================================================
 * Guardian OS — Enterprise Digital Twin graphs (derived, read-only).
 *
 * Six facets of a provisioned enterprise, assembled on demand from the estate
 * entities (lib/ops/entities) + live governance records. Pure projection — no
 * mutable state, nothing to drift. Complements the platform Twin (lib/ops/twin):
 * the Twin is breadth across all customers; this is depth for one enterprise's
 * installed runtime.
 *
 *   enterprise  · identity — org · business units · environments · regions · compliance
 *   asset       · the AI estate — systems · models · agents · MCP · APIs · tools
 *   dependency  · every relationship (refs) across all components
 *   runtime     · environments → what runs in them + governance status
 *   trust       · trust boundaries · IdPs · approvers · operators
 *   risk        · risk zones · critical systems · protected assets + live incidents
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const entities = require("./entities");

const node = (e) => ({ id: e.id, kind: e.kind, name: e.name, layer: e.layer, seeded: e.seeded, attrs: e.attrs });
function edgesFromRefs(list, byId) {
  const edges = [];
  for (const e of list) for (const r of e.refs || []) if (byId[r]) edges.push({ from: e.id, to: r, kind: "depends_on" });
  return edges;
}

async function build(org_id) {
  if (!org_id) return null;
  const [all, org, incidents, policiesActive] = await Promise.all([
    entities.forOrg(org_id),
    rt.store.findOne("orgs", { id: org_id }).catch(() => null),
    require("./incidents").list({ status: "open", org_id, limit: 100 }).catch(() => []),
    require("./govpolicy").active({}).catch(() => []),
  ]);
  const byId = Object.fromEntries(all.map((e) => [e.id, e]));
  const of = (layer, kinds) => all.filter((e) => e.layer === layer && (!kinds || kinds.includes(e.kind)));

  const orgNode = { id: org_id, kind: "organisation", name: (org && org.name) || org_id };

  const enterprise = {
    nodes: [orgNode, ...of("identity").map(node)],
    edges: of("identity").map((e) => ({ from: org_id, to: e.id, kind: "has" })),
  };
  const estate = of("estate");
  const asset = { nodes: estate.map(node), edges: edgesFromRefs(estate, byId) };
  const dependency = { nodes: all.map(node), edges: edgesFromRefs(all, byId) };

  const envs = of("identity", ["environment"]);
  const runtime = {
    nodes: [...envs.map(node), ...of("estate", ["ai_system", "agent"]).map(node)],
    edges: of("estate", ["ai_system", "agent"]).flatMap((e) =>
      (e.refs || []).filter((r) => byId[r] && byId[r].kind === "environment").map((r) => ({ from: r, to: e.id, kind: "runs" }))),
    governance: { active_policies: policiesActive.length },
  };
  const trust = { nodes: of("trust", ["trust_boundary", "identity_provider", "approver", "operator"]).map(node), edges: edgesFromRefs(of("trust", ["trust_boundary", "identity_provider", "approver", "operator"]), byId) };

  const riskEnts = of("trust", ["risk_zone", "critical_system", "protected_asset"]);
  const risk = {
    nodes: riskEnts.map(node),
    edges: edgesFromRefs(riskEnts, byId),
    live: { open_incidents: incidents.length, incidents: incidents.slice(0, 5).map((i) => ({ id: i.id, severity: i.severity, summary: i.summary || i.kind })) },
  };

  const facets = { enterprise, asset, dependency, runtime, trust, risk };
  const counts = Object.fromEntries(Object.entries(facets).map(([k, g]) => [k, { nodes: g.nodes.length, edges: g.edges.length }]));
  return { org_id, generated_at: rt.store.nowISO(), facets, counts };
}

module.exports = { build };
