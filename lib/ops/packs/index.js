/* ============================================================================
 * Guardian OS — Industry Intelligence Pack registry.
 *
 * A pack is DATA + PROJECTIONS, never a product. Registering one is the whole
 * integration: no Guardian OS service is modified and the Runtime Governance
 * kernel is never touched. Adding Defence, Energy, Telecoms, Logistics,
 * Aviation, Life Sciences or Legal Services later means adding a file here.
 *
 * Every pack must satisfy this contract (validated on load, so a malformed
 * pack fails fast rather than half-installing):
 *
 *   id, version, industry, title, purpose   identity + independent versioning
 *   match[]                                 industry keywords for suggestion
 *   regulations[]                           the regulatory world it knows
 *   policies[]                              DENY-ONLY Ω specs, installed via the
 *                                           dynamic policy engine (govpolicy)
 *   templates[]                             policy templates for authoring
 *   evidence_mappings[]                     regulation → control → evidence
 *   incident_workflows[]                    domain incident response
 *   metrics(ctx)                            executive metrics from the ONE context
 *   dashboard(ctx, pack)                    specialised dashboard sections
 *   recommendations(ctx)                    governed recommendation candidates
 * ============================================================================ */
"use strict";

const PACKS = [
  require("./healthcare"),
  require("./finance"),
  require("./cybersecurity"),
  require("./government"),
  require("./manufacturing"),
  require("./insurance"),
  require("./retail"),
  require("./education"),
];

const REQUIRED_FIELDS = ["id", "version", "industry", "title", "purpose"];
const REQUIRED_ARRAYS = ["match", "regulations", "policies", "templates", "evidence_mappings", "incident_workflows"];
const REQUIRED_FNS = ["metrics", "dashboard", "recommendations"];

/** Validate the pack contract. Throws on a malformed pack (fail fast, never half-install). */
function validate(pack) {
  for (const f of REQUIRED_FIELDS) if (!pack || typeof pack[f] !== "string" || !pack[f]) throw new Error(`industry pack missing "${f}"`);
  for (const a of REQUIRED_ARRAYS) if (!Array.isArray(pack[a])) throw new Error(`industry pack ${pack.id} missing array "${a}"`);
  for (const fn of REQUIRED_FNS) if (typeof pack[fn] !== "function") throw new Error(`industry pack ${pack.id} missing function "${fn}"`);
  for (const p of pack.policies) {
    if (!p.name || !p.domain || !p.spec || !p.spec.match) throw new Error(`industry pack ${pack.id} has a malformed policy`);
  }
  return true;
}
for (const p of PACKS) validate(p);

const BY_ID = Object.fromEntries(PACKS.map((p) => [p.id, p]));

/** Catalog metadata (no functions) — safe to serialise to the browser. */
function meta(p) {
  return {
    id: p.id, version: p.version, industry: p.industry, title: p.title, purpose: p.purpose,
    regulations: p.regulations, policies: p.policies.map((x) => ({ name: x.name, domain: x.domain })),
    templates: p.templates.map((t) => ({ name: t.name, description: t.description, domain: t.domain })),
    evidence_mappings: p.evidence_mappings, incident_workflows: p.incident_workflows,
    counts: { policies: p.policies.length, templates: p.templates.length, mappings: p.evidence_mappings.length, workflows: p.incident_workflows.length },
  };
}

const all = () => PACKS;
const get = (id) => BY_ID[id] || null;
const catalog = () => PACKS.map(meta);

/** Suggest the pack matching a free-text industry (from the provisioning spec). */
function suggest(industry) {
  const s = String(industry || "").toLowerCase();
  if (!s) return null;
  for (const p of PACKS) if (p.match.some((m) => s.includes(m))) return p.id;
  return null;
}

module.exports = { all, get, catalog, meta, suggest, validate, PACK_IDS: PACKS.map((p) => p.id) };
