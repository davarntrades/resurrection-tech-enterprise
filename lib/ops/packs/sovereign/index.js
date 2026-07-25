/* ============================================================================
 * Guardian OS — Sovereign Intelligence Pack registry (Phase 7).
 *
 * Sovereign Intelligence Packs are NOT sovereign editions of the Industry
 * Intelligence Packs. They are specialised intelligence for organisations whose
 * MISSION, REGULATION or OPERATING ENVIRONMENT requires sovereign AI — national
 * security, defence, critical infrastructure, public administration, national
 * healthcare, sovereign research and cyber operations.
 *
 * They install onto the same Guardian OS, onto the same Runtime Governance
 * kernel, projected over the same Digital Twin, read through the same Executive
 * Workspaces. There is no sovereign fork and no sovereign edition:
 *
 *     One kernel. One twin. One platform. Many sovereign domains.
 *
 * ── The contract ────────────────────────────────────────────────────────────
 * A sovereign pack satisfies the ordinary Industry Pack contract (identity,
 * regulations, deny-only Ω policies, templates, evidence mappings, incident
 * workflows) PLUS a `sovereign` block carrying the intelligence a national
 * operator needs:
 *
 *   classification      the handling bar the deployment must meet, gating
 *                       installation through lib/ops/sovereignty.js
 *   mission_domain      the sovereign domain this pack speaks for
 *   authority_chains    who may authorise what, and who they delegate to
 *   workflows           governed mission workflows, stage by stage
 *   capabilities        the governed capabilities, and the Ω policies behind them
 *   readiness           operational readiness measures + their grounded sources
 *   risk_models         the risk factors and their escalation conditions
 *   twin_projections    which parts of the ONE twin carry mission meaning
 *   briefings / reports the executive reporting the domain requires
 *
 * ── DECLARATIVE, STRUCTURALLY ───────────────────────────────────────────────
 * Every pack in this directory is DATA. `assertDeclarative` walks each one on
 * load and refuses any pack containing a function anywhere in its object graph.
 * A Sovereign Intelligence Pack therefore cannot introduce executable runtime
 * code into a national deployment — not because the review process forbids it,
 * but because the registry will not load it. Projections come from the shared
 * platform projector (./projections.js).
 *
 * Two consequences worth stating plainly for a government buyer:
 *
 *   · The kernel is unchanged. These packs add Ω policies within the kernel's
 *     EXISTING domain vocabulary. Phase 7 adds no domain, no condition kind, no
 *     evaluation path and no privileged escape.
 *   · A sovereign pack round-trips through a signed offline bundle with no loss
 *     of fidelity, because there is no code to leave behind. The pack installed
 *     from media in an air-gapped facility renders exactly what this one does.
 *
 * ── Extensibility ───────────────────────────────────────────────────────────
 * A new sovereign domain is a new data file listed in PACKS below. This module,
 * every Guardian OS service, and the Runtime Governance kernel stay unchanged.
 * ========================================================================== */
"use strict";
const projections = require("./projections");
const sovereignty = require("../../sovereignty");

const PACKS = [
  require("./national-security"),
  require("./defence-operations"),
  require("./critical-infrastructure"),
  require("./public-sector"),
  require("./national-healthcare"),
  require("./research-development"),
  require("./cyber-operations"),
];

/**
 * The kernel's Ω domain vocabulary, mirrored so a malformed pack is refused at
 * load rather than half way through an install. This is a CHEAPER, EARLIER copy
 * of the check govpolicy.validateSpec already performs — deliberately not a
 * second source of truth, and deliberately not a require, so the registry stays
 * dependency-light enough to load in a static page render. If the kernel's list
 * ever grows, the worst case here is a pack refused early rather than one
 * admitted wrongly: this list can only ever be equal to or stricter than the
 * kernel's, never looser.
 */
const KERNEL_DOMAINS = new Set(["enterprise", "compliance", "data_privacy", "finance", "banking", "fintech", "fraud", "cybersecurity", "healthcare"]);

const REQUIRED_FIELDS = ["id", "version", "industry", "title", "purpose"];
const REQUIRED_ARRAYS = ["match", "regulations", "policies", "templates", "evidence_mappings", "incident_workflows"];
const SOVEREIGN_FIELDS = ["classification", "mission_domain", "mission"];
const SOVEREIGN_ARRAYS = ["authority_chains", "workflows", "capabilities", "readiness", "risk_models", "twin_projections", "briefings", "reports"];

class SovereignPackError extends Error {}

/**
 * Refuse any pack carrying executable code. Walks the whole object graph — a
 * function nested six levels down inside a workflow stage is still code, and is
 * still refused. Cycles are tolerated (a data pack should not contain one, but
 * the check must terminate rather than hang the process on load).
 */
function assertDeclarative(value, path, seen) {
  const t = typeof value;
  if (t === "function") throw new SovereignPackError(`sovereign pack is not declarative: ${path} is a function — sovereign packs may contain data only`);
  if (t === "symbol") throw new SovereignPackError(`sovereign pack is not declarative: ${path} is a symbol`);
  if (value === null || t !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) { value.forEach((v, i) => assertDeclarative(v, `${path}[${i}]`, seen)); return; }
  for (const [k, v] of Object.entries(value)) assertDeclarative(v, `${path}.${k}`, seen);
}

/** Validate the sovereign pack contract. Throws — a malformed pack must fail
 *  fast on load, never half-install into a national deployment. */
function validate(pack) {
  if (!pack || typeof pack !== "object") throw new SovereignPackError("sovereign pack is not an object");
  const id = pack.id || "<unnamed>";
  assertDeclarative(pack, `pack(${id})`, new Set());

  for (const f of REQUIRED_FIELDS) if (typeof pack[f] !== "string" || !pack[f]) throw new SovereignPackError(`sovereign pack ${id} missing "${f}"`);
  for (const a of REQUIRED_ARRAYS) if (!Array.isArray(pack[a])) throw new SovereignPackError(`sovereign pack ${id} missing array "${a}"`);

  for (const p of pack.policies) {
    if (!p || !p.name || !p.domain || !p.spec || !p.spec.match) throw new SovereignPackError(`sovereign pack ${id} has a malformed policy`);
    if (!KERNEL_DOMAINS.has(String(p.domain).toLowerCase())) {
      throw new SovereignPackError(`sovereign pack ${id} policy "${p.name}" uses Ω domain "${p.domain}", which the Runtime Governance kernel does not define — a pack may add policies, never domains`);
    }
    // Deny-only, structurally: a pack may add constraints, never grant permission.
    const c = p.spec.conditions || {};
    for (const key of Object.keys(c)) {
      if (!["unauthorized_unless", "flag_true_blocks", "threshold"].includes(key)) {
        throw new SovereignPackError(`sovereign pack ${id} policy "${p.name}" uses unsupported condition "${key}"`);
      }
    }
  }

  const sov = pack.sovereign;
  if (!sov || typeof sov !== "object") throw new SovereignPackError(`sovereign pack ${id} missing its "sovereign" block`);
  for (const f of SOVEREIGN_FIELDS) if (typeof sov[f] !== "string" || !sov[f]) throw new SovereignPackError(`sovereign pack ${id} missing sovereign.${f}`);
  for (const a of SOVEREIGN_ARRAYS) if (!Array.isArray(sov[a])) throw new SovereignPackError(`sovereign pack ${id} missing sovereign.${a}`);
  // An unknown classification throws here — a pack whose handling bar cannot be
  // assessed can never be admitted to a deployment.
  sovereignty.classification(sov.classification);

  // Readiness sources must be from the projector's CLOSED grammar. An
  // unresolvable source still renders honestly (as a not-instrumented note),
  // but a typo should be caught by the author, not shipped to an operator.
  for (const r of sov.readiness) {
    if (!r || typeof r.key !== "string" || typeof r.label !== "string" || typeof r.source !== "string") {
      throw new SovereignPackError(`sovereign pack ${id} has a malformed readiness measure`);
    }
  }
  return true;
}

/**
 * Compile a declarative pack into the full Industry Pack contract by attaching
 * the SHARED platform projector. This is the only place code meets a sovereign
 * pack, and the code is ours, not the pack's.
 */
function compile(data) {
  validate(data);
  const pack = { ...data, projections: "sovereign", sovereign_pack: true };
  pack.metrics = (ctx) => projections.metrics(pack, ctx || {});
  pack.dashboard = (ctx) => projections.dashboard(pack, ctx || {});
  pack.recommendations = (ctx) => projections.recommendations(pack, ctx || {});
  return pack;
}

const COMPILED = PACKS.map(compile);
const BY_ID = Object.fromEntries(COMPILED.map((p) => [p.id, p]));
const PACK_IDS = COMPILED.map((p) => p.id);

/** The declarative half of a pack — what travels in a signed bundle. Unlike an
 *  Industry Pack, this is the WHOLE pack: there is nothing else to carry. */
function declarative(pack) {
  const { metrics, dashboard, recommendations, projections: _p, sovereign_pack: _s, ...data } = pack;
  return JSON.parse(JSON.stringify(data));
}

/** Sovereign catalog metadata (no functions) — safe to serialise to a browser. */
function meta(p) {
  const sov = p.sovereign || {};
  let cls = null;
  try { cls = sovereignty.classification(sov.classification); } catch { cls = null; }
  return {
    id: p.id, version: p.version, industry: p.industry, title: p.title, purpose: p.purpose,
    sovereign: true,
    classification: sov.classification,
    classification_title: cls ? cls.title : sov.classification,
    classification_rank: cls ? cls.rank : 0,
    eligible_profiles: cls ? sovereignty.eligibleProfiles(cls.id) : [],
    mission_domain: sov.mission_domain,
    mission: sov.mission,
    regulations: p.regulations,
    counts: {
      policies: (p.policies || []).length,
      templates: (p.templates || []).length,
      mappings: (p.evidence_mappings || []).length,
      workflows: (p.incident_workflows || []).length,
      authority_chains: (sov.authority_chains || []).length,
      mission_workflows: (sov.workflows || []).length,
      capabilities: (sov.capabilities || []).length,
      readiness: (sov.readiness || []).length,
      risk_models: (sov.risk_models || []).length,
      twin_projections: (sov.twin_projections || []).length,
      briefings: (sov.briefings || []).length,
      reports: (sov.reports || []).length,
    },
  };
}

const all = () => COMPILED;
const get = (id) => BY_ID[id] || null;
const catalog = () => COMPILED.map(meta);
const isSovereignPack = (id) => Object.prototype.hasOwnProperty.call(BY_ID, id);

/** Suggest a sovereign pack from a free-text mission/industry description. */
function suggest(text) {
  const s = String(text || "").toLowerCase();
  if (!s) return null;
  for (const p of COMPILED) if ((p.match || []).some((m) => s.includes(m))) return p.id;
  return null;
}

module.exports = {
  SovereignPackError, KERNEL_DOMAINS, PACK_IDS,
  all, get, catalog, meta, suggest, validate, compile, declarative, assertDeclarative, isSovereignPack,
};
