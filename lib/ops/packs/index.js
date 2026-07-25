/* ============================================================================
 * Guardian OS — Intelligence Pack registry.
 *
 * A pack is DATA + PROJECTIONS, never a product. Registering one is the whole
 * integration: no Guardian OS service is modified and the Runtime Governance
 * kernel is never touched. Adding Energy, Telecoms, Logistics, Aviation, Life
 * Sciences or Legal Services later means adding a file here.
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
 *
 * TWO FAMILIES, ONE REGISTRY (Phase 7). Industry Intelligence Packs adapt
 * Guardian OS to a SECTOR. Sovereign Intelligence Packs (./sovereign) adapt it
 * to a national MISSION — and additionally declare the deployment guarantees
 * they require, gated at install by lib/ops/sovereignty.js.
 *
 * They share this registry deliberately. A sovereign pack is not a different
 * kind of thing that needs a parallel installer, a parallel dashboard renderer
 * or a parallel lifecycle: it satisfies the same contract, so every consumer
 * below — industry.js, workspaces.js, managed.js, the Control Room, the
 * `guardian` CLI, the offline bundle format — works on both with no change.
 * That is the architecture holding, not a convenience.
 *
 * The one difference is where the projections come from. An Industry Pack
 * brings its own; a Sovereign Pack brings none at all and is rendered by the
 * shared platform projector, which is why it can carry no executable code.
 * ============================================================================ */
"use strict";

const sovereign = require("./sovereign");

const INDUSTRY_PACKS = [
  require("./healthcare"),
  require("./finance"),
  require("./cybersecurity"),
  require("./government"),
  require("./manufacturing"),
  require("./insurance"),
  require("./retail"),
  require("./education"),
];

const SOVEREIGN_PACKS = sovereign.all();

const PACKS = [...INDUSTRY_PACKS, ...SOVEREIGN_PACKS];

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
  const base = {
    id: p.id, version: p.version, industry: p.industry, title: p.title, purpose: p.purpose,
    regulations: p.regulations, policies: p.policies.map((x) => ({ name: x.name, domain: x.domain })),
    templates: p.templates.map((t) => ({ name: t.name, description: t.description, domain: t.domain })),
    evidence_mappings: p.evidence_mappings, incident_workflows: p.incident_workflows,
    counts: { policies: p.policies.length, templates: p.templates.length, mappings: p.evidence_mappings.length, workflows: p.incident_workflows.length },
    sovereign: false,
  };
  // A sovereign pack carries its whole declarative payload here too, so the
  // Control Room, the website and the CLI all read ONE catalog shape.
  return sovereign.isSovereignPack(p.id) ? { ...base, ...sovereign.meta(p) } : base;
}

const all = () => PACKS;
const get = (id) => BY_ID[id] || null;
const catalog = () => PACKS.map(meta);

/** Industry packs only — the Phase 5 catalog, unchanged. */
const industryPacks = () => INDUSTRY_PACKS;
/** Sovereign packs only — the Phase 7 catalog. */
const sovereignPacks = () => SOVEREIGN_PACKS;
const isSovereign = (id) => sovereign.isSovereignPack(id);

/**
 * Suggest the INDUSTRY pack matching a free-text industry (from the
 * provisioning spec). Deliberately unchanged by Phase 7: a sovereign pack is
 * never auto-suggested from an industry string, because installing one asserts
 * something about the DEPLOYMENT, not just the sector. Sovereign selection is
 * an explicit, assessed decision — see suggestSovereign.
 */
function suggest(industry) {
  const s = String(industry || "").toLowerCase();
  if (!s) return null;
  for (const p of INDUSTRY_PACKS) if (p.match.some((m) => s.includes(m))) return p.id;
  return null;
}

/** Suggest a sovereign pack from a mission description. Suggestion only — the
 *  admissibility gate still decides whether it may be installed here. */
const suggestSovereign = (text) => sovereign.suggest(text);

module.exports = {
  all, get, catalog, meta, suggest, suggestSovereign, validate,
  industryPacks, sovereignPacks, isSovereign,
  PACK_IDS: PACKS.map((p) => p.id),
  INDUSTRY_PACK_IDS: INDUSTRY_PACKS.map((p) => p.id),
  SOVEREIGN_PACK_IDS: SOVEREIGN_PACKS.map((p) => p.id),
};
