/* ============================================================================
 * Guardian OS — Industry Intelligence Packs (Phase 5): registry + installer.
 *
 * Guardian OS is ONE operating system on ONE Runtime Governance kernel.
 * An Industry Pack does NOT fork it, duplicate it, or ship beside it — a pack
 * only CONTRIBUTES domain intelligence that plugs into services that already
 * exist:
 *
 *   Ω policies        → installed through the dynamic policy engine (govpolicy):
 *                       draft → validate → activate, deny-only, org-scoped.
 *   dashboards        → projections over workspaces.context() — the SAME shared
 *                       enterprise context every executive workspace reads.
 *   executive metrics → derived from that one context, never re-queried.
 *   recommendations   → fed into managed governance, so they flow through the
 *                       same proposal → Ω → approval → execution → evidence path.
 *   templates /
 *   evidence mappings → declarative knowledge (policy authoring + compliance).
 *
 * Installation is GOVERNED and reversible: activating a pack's policies is the
 * existing privileged, evidence-backed lifecycle; uninstalling rolls those
 * policies back (always allowed, the safety brake). With no pack installed the
 * kernel is byte-for-byte what it was — packs can only ever ADD constraints.
 *
 * Extensibility: a new industry is a new file in lib/ops/packs/. This module,
 * every Guardian OS service, and the Runtime Governance kernel stay unchanged.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const store = rt.store;
const registry = require("./packs");
const govpolicy = require("./govpolicy");
const events = require("./events");
const sovereignPacks = require("../sovereign/packs");
const immutable = require("../sovereign/immutable");
const sovereignty = require("./sovereignty");

const shape = (r) => (!r ? null : {
  id: r.id, org_id: r.org_id, pack_id: r.pack_id, version: r.version, status: r.status,
  policies: r.policies || [], installed_by: r.installed_by || null, created_at: r.created_at, removed_at: r.removed_at || null,
  // Sovereign (Phase 6): where the pack came from, and whether its bespoke
  // projections exist in this build. `content` is the declarative payload of a
  // bundle-installed pack, retained so an air-gapped box can render it after a
  // restart without the media being present.
  source: r.source || "registry", projections: r.projections || "builtin", content: r.content || null,
});

/**
 * The pack behind an install row. A registry (shipped) pack wins; otherwise the
 * declarative content carried by a bundle install is adapted into the same
 * contract. Every consumer below goes through this, so a bundle-installed pack
 * behaves exactly like a shipped one everywhere.
 */
function packFor(row) {
  const built = registry.get(row && row.pack_id);
  if (built) return built;
  if (row && row.content) { try { return sovereignPacks.adapt(row.content); } catch { return null; } }
  return null;
}

// ── Catalog ─────────────────────────────────────────────────────────────────
const catalog = () => registry.catalog();
const get = (id) => registry.get(id);
const suggest = (industry) => registry.suggest(industry);

/** Installed packs for an enterprise (active installs only unless all=true). */
async function installed(org_id, { all = false } = {}) {
  if (!org_id) return [];
  const rows = (await store.find("industry_packs", { org_id }).catch(() => [])).map(shape);
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return all ? rows : rows.filter((r) => r.status === "installed");
}
async function isInstalled(org_id, pack_id) {
  return (await installed(org_id)).some((r) => r.pack_id === pack_id);
}

// ── Install — governed, versioned, evidence-backed ──────────────────────────
/**
 * Install an Industry Pack into a provisioned enterprise. The pack's Ω policies
 * go through the SAME governed lifecycle as any other policy (draft → validate →
 * activate); nothing else about Guardian OS changes.
 */
async function install(org_id, pack_id, { actor = "operator", activate = true, content = null, source = "registry" } = {}) {
  immutable.assertMutable("industry pack installation");
  const pack = registry.get(pack_id) || (content ? sovereignPacks.adapt(content) : null);
  if (!pack) throw new Error(`unknown industry pack "${pack_id}"`);
  if (!org_id) throw new Error("an enterprise is required to install an industry pack");
  if (await isInstalled(org_id, pack_id)) throw new Error(`${pack.title} is already installed for this enterprise`);
  // Sovereignty admissibility (Phase 7). A Sovereign Intelligence Pack declares
  // the deployment guarantees its classification requires; this deployment
  // either provides them or the install is refused BEFORE any policy is
  // drafted, so a refusal leaves the enterprise exactly as it was. Ordinary
  // Industry Packs pass through untouched.
  sovereignty.assertInstallable(pack);

  const applied = [];
  for (const p of pack.policies) {
    try {
      const d = await govpolicy.draft({
        name: p.name, scope: org_id, domain: p.domain, spec: p.spec,
        notes: `${pack.title} v${pack.version}`, created_by: actor,
      });
      await govpolicy.validate(d.id, { actor });
      let status = "validated";
      if (activate) { await govpolicy.activate(d.id, { actor }); status = "active"; }
      applied.push({ id: d.id, name: p.name, status });
    } catch (e) {
      applied.push({ name: p.name, status: "error", error: e.message });
    }
  }

  const projections = sovereignPacks.projectionMode(pack_id);
  const row = await store.insert("industry_packs", {
    org_id, pack_id, version: pack.version, status: "installed",
    policies: applied, config: {}, installed_by: actor, removed_at: null, updated_at: store.nowISO(),
    // Retained so an offline install survives a restart with no media present.
    source, projections, content: source === "bundle" ? (content || sovereignPacks.declarative(pack)) : null,
  });
  await rt.adminaudit.record({ action: "industry_pack_installed", actor, via: "ops", target: org_id, meta: { pack_id, version: pack.version, policies: applied.length, source } }).catch(() => {});
  await events.emit("industry.pack_installed", { org_id, pack_id, version: pack.version, policies: applied.length, source }, { org_id });
  rt.log.info("industry_pack_installed", { org_id, pack_id, version: pack.version, source, projections, active: applied.filter((a) => a.status === "active").length });
  return { ...shape(row), pack: registry.meta(pack), activated: applied.filter((a) => a.status === "active").length };
}

/**
 * Install an Industry Pack from a SIGNED OFFLINE BUNDLE — the air-gapped path.
 *
 *   guardian pack install ./finance.pack
 *
 * The bundle's signature and content hashes are verified BEFORE anything is
 * installed; only then is the immutable-runtime window opened, and only for the
 * duration of this install. Everything after that point is the ordinary
 * governed lifecycle (draft → validate → activate through govpolicy), so an
 * offline install produces exactly the same evidence as a cloud one.
 */
async function installFromBundle(org_id, target, { actor = "operator", activate = true, trust = null, requireSignature = null } = {}) {
  const { manifest, content, report } = sovereignPacks.readPack(target, { trust, requireSignature });
  rt.log.info("industry_pack_bundle_verified", {
    org_id, pack_id: content.id, version: manifest.version, alg: report.alg, key_id: report.key_id,
    projections: sovereignPacks.projectionMode(content.id),
  });
  const result = await immutable.withVerifiedBundle(() =>
    install(org_id, content.id, { actor, activate, content, source: "bundle" }));
  await rt.adminaudit.record({
    action: "industry_pack_installed_offline", actor, via: "guardian-cli", target: org_id,
    meta: { pack_id: content.id, version: manifest.version, signature: report.alg, key_id: report.key_id, bundle: String(target) },
  }).catch(() => {});
  return { ...result, bundle: { id: manifest.id, version: manifest.version, signed: report.signed, alg: report.alg, key_id: report.key_id } };
}

/** Uninstall — rolls the pack's policies back (always allowed; the brake). */
async function uninstall(org_id, pack_id, { actor = "operator" } = {}) {
  const rows = (await store.find("industry_packs", { org_id, pack_id }).catch(() => [])).filter((r) => r.status === "installed");
  if (!rows.length) throw new Error(`${pack_id} is not installed for this enterprise`);
  // Uninstall is the brake: it only rolls policies back, so it stays available
  // under an immutable runtime for the same reason govpolicy.rollback does.
  const pack = packFor(rows[0]);
  const rolled = [];
  for (const p of (pack ? pack.policies : [])) {
    try { await govpolicy.rollback({ name: p.name, scope: org_id, actor }); rolled.push(p.name); }
    catch { /* already inactive — rollback stays idempotent */ }
  }
  for (const r of rows) await store.update("industry_packs", r.id, { status: "removed", removed_at: store.nowISO(), updated_at: store.nowISO() });
  await rt.adminaudit.record({ action: "industry_pack_removed", actor, via: "ops", target: org_id, meta: { pack_id, policies_rolled_back: rolled.length } }).catch(() => {});
  await events.emit("industry.pack_removed", { org_id, pack_id, rolled_back: rolled.length }, { org_id });
  return { org_id, pack_id, removed: rows.length, policies_rolled_back: rolled };
}

// ── Projections over the ONE shared enterprise context ──────────────────────
/** Lazy require avoids a cycle: workspaces surfaces packs, packs read context. */
const workspaces = () => require("./workspaces");

/** The pack's specialised dashboard + executive metrics for one enterprise. */
async function dashboard(org_id, pack_id, { ctx = null } = {}) {
  const pack = await resolve(org_id, pack_id);
  if (!pack || !org_id) return null;
  const context = ctx || (await workspaces().context(org_id));
  return {
    pack_id: pack.id, version: pack.version, title: pack.title, industry: pack.industry, purpose: pack.purpose,
    org_id, name: context.name, generated_at: store.nowISO(),
    installed: await isInstalled(org_id, pack_id),
    projections: pack.projections || "builtin",
    regulations: pack.regulations,
    // Sovereign packs report their live admissibility alongside the dashboard,
    // so an operator sees the deployment position and the domain intelligence
    // in one place rather than inferring one from the other.
    sovereign: sovereignty.isSovereign(pack) ? sovereignty.assessPack(pack) : null,
    metrics: pack.metrics(context),
    sections: pack.dashboard(context, pack),
  };
}

/** Executive metrics only (cheap surface for briefings/overviews). */
async function metrics(org_id, pack_id, { ctx = null } = {}) {
  const pack = await resolve(org_id, pack_id);
  if (!pack || !org_id) return [];
  return pack.metrics(ctx || (await workspaces().context(org_id)));
}

/** A pack by id for one enterprise: shipped registry first, then whatever a
 *  signed bundle installed here. Async because the second source is the store. */
async function resolve(org_id, pack_id) {
  const built = registry.get(pack_id);
  if (built) return built;
  if (!org_id) return null;
  const row = (await installed(org_id)).find((r) => r.pack_id === pack_id);
  return row ? packFor(row) : null;
}

/**
 * Recommendation candidates from every INSTALLED pack. Managed Governance calls
 * this, so pack recommendations flow through the same governed proposal path
 * (proposal → Ω → approval → execution → evidence) as every other recommendation.
 */
async function recommendations(org_id, { ctx = null } = {}) {
  const packs = await installed(org_id);
  if (!packs.length) return [];
  const context = ctx || (await workspaces().context(org_id));
  const out = [];
  for (const row of packs) {
    const pack = packFor(row);
    if (!pack) continue;
    try {
      for (const r of pack.recommendations(context) || []) out.push({ ...r, source_pack: pack.id });
    } catch (e) { rt.log.warn("industry_pack_recommendations_failed", { pack: row.pack_id, error: e.message }); }
  }
  return out;
}

/** Policy templates contributed by installed packs (for the authoring UI). */
async function templates(org_id) {
  const packs = await installed(org_id);
  return packs.flatMap((row) => {
    const pack = packFor(row);
    return pack ? pack.templates.map((t) => ({ ...t, pack_id: pack.id, pack_title: pack.title })) : [];
  });
}

/** Everything an enterprise's intelligence layer contributes, at a glance. */
async function summary(org_id) {
  const inst = await installed(org_id);
  const packs = inst.map(packFor).filter(Boolean);
  const sov = packs.filter(sovereignty.isSovereign);
  return {
    org_id, installed: inst.length,
    packs: inst.map((r) => ({ pack_id: r.pack_id, version: r.version, installed_by: r.installed_by, created_at: r.created_at, source: r.source, projections: r.projections, sovereign: registry.isSovereign(r.pack_id) })),
    regulations: [...new Set(packs.flatMap((p) => p.regulations))],
    policies: packs.reduce((n, p) => n + p.policies.length, 0),
    templates: packs.reduce((n, p) => n + p.templates.length, 0),
    available: registry.PACK_IDS.length,
    // Phase 7 — the sovereign position of this enterprise's intelligence layer.
    sovereign: {
      installed: sov.length,
      available: registry.SOVEREIGN_PACK_IDS.length,
      posture: sovereignty.posture(),
      // A pack that no longer meets its handling bar (because the deployment
      // profile changed after install) is the finding an operator most needs.
      inadmissible: sov.map((p) => sovereignty.assessPack(p)).filter((a) => !a.ok),
    },
  };
}

/**
 * The sovereign catalog with LIVE admissibility for this deployment — what may
 * be installed here, what may not, and why. The commercial catalog and the
 * operational truth are the same list, which is the point.
 */
function sovereignCatalog({ profile = null } = {}) {
  return registry.sovereignPacks().map((p) => ({
    ...registry.meta(p),
    admissibility: sovereignty.assessPack(p, { profile }),
  }));
}

module.exports = {
  catalog, get, suggest, installed, isInstalled, resolve, packFor,
  install, installFromBundle, uninstall, dashboard, metrics, recommendations, templates, summary,
  sovereignCatalog, sovereignty,
  PACK_IDS: registry.PACK_IDS,
  INDUSTRY_PACK_IDS: registry.INDUSTRY_PACK_IDS,
  SOVEREIGN_PACK_IDS: registry.SOVEREIGN_PACK_IDS,
};
