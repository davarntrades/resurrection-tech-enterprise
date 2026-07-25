/* ============================================================================
 * Guardian OS Sovereign — offline Industry Intelligence Packs.
 *
 * The same eight packs, delivered on media instead of over a network:
 *
 *     guardian pack export finance --sign      →  finance.pack
 *     guardian pack install ./finance.pack     (air-gapped, no internet)
 *
 * WHAT TRAVELS IN A PACK BUNDLE IS DATA, NEVER CODE. A pack's Ω policies,
 * templates, evidence mappings, incident workflows and regulations are
 * declarative and serialise exactly; its `metrics/dashboard/recommendations`
 * are JavaScript and deliberately do NOT. Guardian OS has never executed code
 * that arrived as content — not from the database, and not from a USB stick —
 * and installing a signed bundle does not become the exception.
 *
 * So a pack installs in one of two modes, and the difference is reported
 * honestly rather than papered over:
 *
 *   builtin   the pack's code is present in this image (the eight shipped
 *             packs). The bundle's data installs and the pack's own bespoke
 *             projections render, identical to a cloud install.
 *   generic   the pack's code is NOT in this image (a pack authored for a
 *             later release, or a customer-authored one). Everything that is
 *             data still installs and ENFORCES — the Ω policies are the part
 *             that actually governs — and the dashboard renders through the
 *             shared declarative projection below instead of bespoke code.
 *
 * Enforcement is identical in both modes. Only presentation differs, and
 * `guardian verify` says which mode each installed pack is running in.
 *
 * Installation is the SAME governed lifecycle as a cloud install: every policy
 * goes draft → validate → activate through govpolicy, scoped to the enterprise,
 * evidence-backed and reversible. A bundle is a delivery mechanism, not a
 * bypass.
 * ========================================================================== */
"use strict";
const path = require("node:path");
const bundle = require("./bundle");
const profiles = require("./profiles");
const S = require("../ops/sections");
const registry = require("../ops/packs");

const PACK_ENTRY = (id) => `pack/${id}.json`;
const CONTENT_FIELDS = ["id", "version", "industry", "title", "purpose", "match", "regulations", "policies", "templates", "evidence_mappings", "incident_workflows"];

class PackBundleError extends Error {}

// ── Serialisation ───────────────────────────────────────────────────────────

/** The declarative half of a pack — everything that can honestly travel. */
function declarative(pack) {
  if (!pack) throw new PackBundleError("no pack");
  const out = {};
  for (const f of CONTENT_FIELDS) out[f] = pack[f];
  return out;
}

/** Structural check on declarative content read from a bundle. Mirrors the
 *  registry contract minus the function fields, which a bundle never carries. */
function validateContent(c) {
  for (const f of ["id", "version", "industry", "title", "purpose"]) {
    if (!c || typeof c[f] !== "string" || !c[f]) throw new PackBundleError(`pack bundle missing "${f}"`);
  }
  for (const a of ["match", "regulations", "policies", "templates", "evidence_mappings", "incident_workflows"]) {
    if (!Array.isArray(c[a])) throw new PackBundleError(`pack bundle ${c.id} missing array "${a}"`);
  }
  for (const p of c.policies) {
    if (!p || !p.name || !p.domain || !p.spec || !p.spec.match) throw new PackBundleError(`pack bundle ${c.id} has a malformed policy`);
  }
  return true;
}

// ── Export ──────────────────────────────────────────────────────────────────

/**
 * Build a signed pack bundle for one industry pack.
 *   sign  { alg:"ed25519", key_id, private_key_pem } | { alg:"hmac-sha256", key_id, secret } | null
 */
function exportPack(pack_id, { sign = null, produced_by } = {}) {
  const pack = registry.get(pack_id);
  if (!pack) throw new PackBundleError(`unknown industry pack "${pack_id}"`);
  const content = declarative(pack);
  return bundle.build({
    kind: "pack",
    id: pack.id,
    version: pack.version,
    produced_by: produced_by || "guardian-cli/1",
    metadata: { industry: pack.industry, title: pack.title, projections: "builtin", policies: pack.policies.length },
    files: { [PACK_ENTRY(pack.id)]: JSON.stringify(content, null, 2) + "\n" },
    sign,
  });
}

/** Write every shipped pack to `dir` as `<id>.pack`. Returns the file list. */
function exportAll(dir, { sign = null } = {}) {
  return registry.PACK_IDS.map((id) => bundle.writeFile(exportPack(id, { sign }), path.join(dir, `${id}.pack`)));
}

// ── Read + verify ───────────────────────────────────────────────────────────

/**
 * Read and verify a pack bundle. Throws unless it verifies completely — an
 * install must never proceed on a bundle we only mostly trust.
 */
function readPack(target, { trust = null, requireSignature = null } = {}) {
  const b = bundle.read(target);
  const needSig = requireSignature === null ? profiles.requiresSignedBundles() : requireSignature;
  const report = bundle.verify(b, { trust: trust || bundle.loadTrust(), requireSignature: needSig });
  if (!report.ok) throw new PackBundleError(`pack bundle ${target} failed verification: ${report.errors.join("; ")}`);
  if (b.manifest.kind !== "pack") throw new PackBundleError(`${target} is a "${b.manifest.kind}" bundle, not a pack`);
  const entry = PACK_ENTRY(b.manifest.id);
  const content = bundle.entryJSON(b, entry);
  validateContent(content);
  if (content.id !== b.manifest.id) throw new PackBundleError(`pack id ${content.id} does not match the manifest id ${b.manifest.id}`);
  return { manifest: b.manifest, content, report };
}

// ── Generic projections (declarative mode) ──────────────────────────────────

/**
 * A pack whose code is not in this image still gets a real dashboard — built
 * from the SAME shared section vocabulary every other Guardian OS surface uses,
 * over the SAME one enterprise context. It shows what the pack actually knows
 * (its regulations, its installed policies, its evidence mappings, its incident
 * workflows) and nothing it does not. No figure here is invented: counts come
 * from the context, and anything not instrumented is an explicit note.
 */
function genericMetrics(content, ctx) {
  const names = new Set((content.policies || []).map((p) => p.name));
  const activeHere = (ctx.scopedPolicies || []).filter((p) => names.has(p.name));
  const blocked = (ctx.blocked || []).filter((e) => e.rule && names.has(e.rule));
  return [
    { label: `${content.industry} policies enforcing`, value: activeHere.length, of: (content.policies || []).length },
    { label: "Blocked by this pack", value: blocked.length },
    { label: "Regulations mapped", value: (content.regulations || []).length },
    { label: "Incident workflows", value: (content.incident_workflows || []).length },
  ];
}

function genericDashboard(content, ctx) {
  const names = new Set((content.policies || []).map((p) => p.name));
  const activeHere = (ctx.scopedPolicies || []).filter((p) => names.has(p.name));
  const blocked = (ctx.blocked || []).filter((e) => e.rule && names.has(e.rule));
  return [
    S.stat("enforcement", `${content.title} — enforcement`, [
      { label: "Policies enforcing", value: activeHere.length },
      { label: "Policies in the pack", value: (content.policies || []).length },
      { label: "Blocked actions attributed", value: blocked.length },
    ]),
    S.list("policies", "Ω policies contributed", (content.policies || []).map((p) => ({
      label: p.name,
      detail: `${p.domain} · ${activeHere.some((a) => a.name === p.name) ? "enforcing" : "not active"}`,
      severity: activeHere.some((a) => a.name === p.name) ? "info" : "warning",
    })), "This pack contributes no policies."),
    S.list("regulations", "Regulatory scope", (content.regulations || []).map((r) => ({ label: r })), "No regulations declared."),
    S.list("evidence", "Regulation → control → evidence", (content.evidence_mappings || []).map((m) => ({
      label: m.regulation, detail: `${m.control} — ${m.evidence}`,
    })), "No evidence mappings declared."),
    S.list("workflows", "Incident workflows", (content.incident_workflows || []).map((w) => ({
      label: w.name || w.title || w.id, detail: w.description || (Array.isArray(w.steps) ? w.steps.join(" → ") : ""),
    })), "No incident workflows declared."),
    S.note("projections", "Bespoke industry analytics",
      "this pack's projection code is not present in this build — its policies enforce and its declarative intelligence is shown in full, but its industry-specific analytics require the release that ships the pack's code"),
  ];
}

function genericRecommendations(content, ctx) {
  const names = new Set((content.policies || []).map((p) => p.name));
  const activeNames = new Set((ctx.scopedPolicies || []).map((p) => p.name));
  const missing = [...names].filter((n) => !activeNames.has(n));
  if (!missing.length) return [];
  return [{
    title: `${content.title}: ${missing.length} contributed ${missing.length === 1 ? "policy is" : "policies are"} not enforcing`,
    detail: `Installed but inactive: ${missing.join(", ")}. Re-activate them, or uninstall the pack so the estate's governance posture reflects reality.`,
    severity: "warning",
  }];
}

/**
 * Adapt declarative content into an object satisfying the full registry
 * contract, so every Guardian OS surface treats a bundle-installed pack exactly
 * like a shipped one. If the pack's code IS in this image, the built-in pack is
 * returned instead — the bundle's data is then only a delivery mechanism.
 */
function adapt(content) {
  const builtin = registry.get(content && content.id);
  if (builtin) return builtin;
  validateContent(content);
  const c = JSON.parse(JSON.stringify(content));
  return {
    ...c,
    projections: "generic",
    metrics: (ctx) => genericMetrics(c, ctx || {}),
    dashboard: (ctx) => genericDashboard(c, ctx || {}),
    recommendations: (ctx) => genericRecommendations(c, ctx || {}),
  };
}

/** Which projection mode a given pack id will run in on THIS build. */
const projectionMode = (id) => (registry.get(id) ? "builtin" : "generic");

module.exports = {
  PackBundleError, PACK_ENTRY, CONTENT_FIELDS,
  declarative, validateContent, exportPack, exportAll, readPack,
  adapt, projectionMode, genericMetrics, genericDashboard, genericRecommendations,
};
