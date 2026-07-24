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

const shape = (r) => (!r ? null : {
  id: r.id, org_id: r.org_id, pack_id: r.pack_id, version: r.version, status: r.status,
  policies: r.policies || [], installed_by: r.installed_by || null, created_at: r.created_at, removed_at: r.removed_at || null,
});

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
async function install(org_id, pack_id, { actor = "operator", activate = true } = {}) {
  const pack = registry.get(pack_id);
  if (!pack) throw new Error(`unknown industry pack "${pack_id}"`);
  if (!org_id) throw new Error("an enterprise is required to install an industry pack");
  if (await isInstalled(org_id, pack_id)) throw new Error(`${pack.title} is already installed for this enterprise`);

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

  const row = await store.insert("industry_packs", {
    org_id, pack_id, version: pack.version, status: "installed",
    policies: applied, config: {}, installed_by: actor, removed_at: null, updated_at: store.nowISO(),
  });
  await rt.adminaudit.record({ action: "industry_pack_installed", actor, via: "ops", target: org_id, meta: { pack_id, version: pack.version, policies: applied.length } }).catch(() => {});
  await events.emit("industry.pack_installed", { org_id, pack_id, version: pack.version, policies: applied.length }, { org_id });
  rt.log.info("industry_pack_installed", { org_id, pack_id, version: pack.version, active: applied.filter((a) => a.status === "active").length });
  return { ...shape(row), pack: registry.meta(pack), activated: applied.filter((a) => a.status === "active").length };
}

/** Uninstall — rolls the pack's policies back (always allowed; the brake). */
async function uninstall(org_id, pack_id, { actor = "operator" } = {}) {
  const rows = (await store.find("industry_packs", { org_id, pack_id }).catch(() => [])).filter((r) => r.status === "installed");
  if (!rows.length) throw new Error(`${pack_id} is not installed for this enterprise`);
  const pack = registry.get(pack_id);
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
  const pack = registry.get(pack_id);
  if (!pack || !org_id) return null;
  const context = ctx || (await workspaces().context(org_id));
  return {
    pack_id: pack.id, version: pack.version, title: pack.title, industry: pack.industry, purpose: pack.purpose,
    org_id, name: context.name, generated_at: store.nowISO(),
    installed: await isInstalled(org_id, pack_id),
    regulations: pack.regulations,
    metrics: pack.metrics(context),
    sections: pack.dashboard(context, pack),
  };
}

/** Executive metrics only (cheap surface for briefings/overviews). */
async function metrics(org_id, pack_id, { ctx = null } = {}) {
  const pack = registry.get(pack_id);
  if (!pack || !org_id) return [];
  return pack.metrics(ctx || (await workspaces().context(org_id)));
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
    const pack = registry.get(row.pack_id);
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
    const pack = registry.get(row.pack_id);
    return pack ? pack.templates.map((t) => ({ ...t, pack_id: pack.id, pack_title: pack.title })) : [];
  });
}

/** Everything an enterprise's industry layer contributes, at a glance. */
async function summary(org_id) {
  const inst = await installed(org_id);
  const packs = inst.map((r) => registry.get(r.pack_id)).filter(Boolean);
  return {
    org_id, installed: inst.length,
    packs: inst.map((r) => ({ pack_id: r.pack_id, version: r.version, installed_by: r.installed_by, created_at: r.created_at })),
    regulations: [...new Set(packs.flatMap((p) => p.regulations))],
    policies: packs.reduce((n, p) => n + p.policies.length, 0),
    templates: packs.reduce((n, p) => n + p.templates.length, 0),
    available: registry.PACK_IDS.length,
  };
}

module.exports = {
  catalog, get, suggest, installed, isInstalled,
  install, uninstall, dashboard, metrics, recommendations, templates, summary,
  PACK_IDS: registry.PACK_IDS,
};
