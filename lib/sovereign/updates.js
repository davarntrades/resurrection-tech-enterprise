/* ============================================================================
 * Guardian OS Sovereign — offline update packages.
 *
 *     guardian update ./guardian-1.4.0.gos
 *
 * One signed file, carried on media, that a disconnected estate can apply and
 * un-apply. An update bundle may contain:
 *
 *   policies/*.json    Ω policy specs → drafted, validated and activated
 *                      through the ordinary governed lifecycle
 *   packs/*.json       declarative Industry Intelligence Pack content
 *   migrations/*.sql   schema changes — REPORTED, never executed (see below)
 *   notes.md           human release notes
 *
 * THREE PROPERTIES THIS DESIGN INSISTS ON
 *
 * 1. VERIFIED BEFORE ANYTHING HAPPENS. The signature and every content hash are
 *    checked first. Only then does the immutable-runtime window open, and only
 *    for the duration of the apply.
 *
 * 2. A ROLLBACK PLAN IS CAPTURED BEFORE THE FIRST CHANGE. Every policy this
 *    update will supersede, and every pack it will install, are recorded first.
 *    An update that cannot be described in reverse is not applied.
 *
 * 3. MIGRATIONS ARE NEVER AUTO-EXECUTED. Guardian OS does not run DDL it found
 *    inside a file that arrived on a USB stick, however well signed. Migrations
 *    are surfaced with their hashes for a DBA to apply deliberately, and the
 *    apply result records which ones are outstanding. On a local-store
 *    deployment there is no schema to migrate and the section is informational.
 *
 * Partial application is recorded, not hidden: if a policy in the middle of the
 * set fails, the update lands as `partial` with the per-item outcome, and the
 * rollback plan still covers everything that did change.
 * ========================================================================== */
"use strict";
const bundleFmt = require("./bundle");
const profiles = require("./profiles");
const immutable = require("./immutable");
const sovereignPacks = require("./packs");

const COLLECTION = "sovereign_updates";
const POLICY_PREFIX = "policies/";
const PACK_PREFIX = "packs/";
const MIGRATION_PREFIX = "migrations/";

class UpdateError extends Error {}

const shape = (r) => (!r ? null : {
  id: r.id, org_id: r.org_id || null, bundle_id: r.bundle_id, version: r.version,
  status: r.status, signature: r.signature || null, key_id: r.key_id || null,
  applied: r.applied || [], migrations: r.migrations || [], rollback_plan: r.rollback_plan || null,
  applied_by: r.applied_by || null, created_at: r.created_at, rolled_back_at: r.rolled_back_at || null,
});

// ── Inspect (read-only; safe to run before deciding to apply) ────────────────

/** Verify an update bundle and describe exactly what applying it would do. */
function inspect(target, { trust = null, requireSignature = null } = {}) {
  const b = bundleFmt.read(target);
  const needSig = requireSignature === null ? profiles.requiresSignedBundles() : requireSignature;
  const report = bundleFmt.verify(b, { trust: trust || bundleFmt.loadTrust(), requireSignature: needSig });
  if (!report.ok) throw new UpdateError(`update bundle ${target} failed verification: ${report.errors.join("; ")}`);
  if (b.manifest.kind !== "update") throw new UpdateError(`${target} is a "${b.manifest.kind}" bundle — use the matching command`);

  const policies = [];
  const packs = [];
  const migrations = [];
  for (const e of b.manifest.entries) {
    if (e.path.startsWith(POLICY_PREFIX) && e.path.endsWith(".json")) {
      const doc = bundleFmt.entryJSON(b, e.path);
      for (const item of (Array.isArray(doc) ? doc : [doc])) {
        if (item && item.spec) policies.push({ name: item.name || item.spec.name, domain: item.domain || item.spec.domain, scope: item.scope || "global", spec: item.spec, path: e.path });
      }
    } else if (e.path.startsWith(PACK_PREFIX) && e.path.endsWith(".json")) {
      const content = bundleFmt.entryJSON(b, e.path);
      sovereignPacks.validateContent(content);
      packs.push({ id: content.id, version: content.version, title: content.title, projections: sovereignPacks.projectionMode(content.id), content });
    } else if (e.path.startsWith(MIGRATION_PREFIX)) {
      migrations.push({ path: e.path, sha256: e.sha256, bytes: e.bytes });
    }
  }
  return {
    manifest: b.manifest, report, bundle: b,
    release: b.manifest.version,
    notes: b.files["notes.md"] ? b.files["notes.md"].toString("utf8") : null,
    policies, packs, migrations,
  };
}

// ── Apply ───────────────────────────────────────────────────────────────────

/**
 * Apply a verified update bundle. `org_id` scopes pack installation and any
 * policy whose scope is "org" (a bundle can also carry global policies).
 */
async function apply(target, { org_id = null, actor = "operator", trust = null, requireSignature = null, rt = null, ops = null } = {}) {
  const runtime = rt || require("../runtime");
  const opsMod = ops || require("../ops");
  const store = runtime.store;

  const plan = inspect(target, { trust, requireSignature });
  runtime.log.info("sovereign_update_verified", {
    bundle: plan.manifest.id, version: plan.manifest.version, alg: plan.report.alg, key_id: plan.report.key_id,
    policies: plan.policies.length, packs: plan.packs.length, migrations: plan.migrations.length,
  });

  // (2) The rollback plan is captured BEFORE the first change.
  const rollback_plan = { policies: [], packs: [] };
  for (const p of plan.policies) {
    const scope = p.scope === "org" ? (org_id || "global") : p.scope;
    const current = (await store.find("governance_policies", { name: p.name, scope, status: "active" }).catch(() => []))[0];
    rollback_plan.policies.push({ name: p.name, scope, previous_version: current ? current.version : null });
  }
  for (const pk of plan.packs) {
    const already = org_id ? await opsMod.industry.isInstalled(org_id, pk.id).catch(() => false) : false;
    rollback_plan.packs.push({ pack_id: pk.id, was_installed: already });
  }

  const row = await store.insert(COLLECTION, {
    org_id, bundle_id: plan.manifest.id, version: plan.manifest.version, status: "applying",
    signature: plan.report.alg, key_id: plan.report.key_id || null,
    applied: [], migrations: plan.migrations, rollback_plan, applied_by: actor,
    rolled_back_at: null, updated_at: store.nowISO(),
  });

  const applied = [];
  await immutable.withVerifiedBundle(async () => {
    for (const p of plan.policies) {
      const scope = p.scope === "org" ? (org_id || "global") : p.scope;
      try {
        const d = await opsMod.govpolicy.draft({ name: p.name, scope, domain: p.domain, spec: p.spec, notes: `update ${plan.manifest.id} v${plan.manifest.version}`, created_by: actor });
        await opsMod.govpolicy.validate(d.id, { actor });
        await opsMod.govpolicy.activate(d.id, { actor });
        applied.push({ kind: "policy", name: p.name, scope, id: d.id, version: d.version, status: "active" });
      } catch (e) {
        applied.push({ kind: "policy", name: p.name, scope, status: "error", error: e.message });
      }
    }
    for (const pk of plan.packs) {
      if (!org_id) { applied.push({ kind: "pack", pack_id: pk.id, status: "skipped", error: "no enterprise provisioned — pack content stored, install with `guardian pack install`" }); continue; }
      try {
        if (await opsMod.industry.isInstalled(org_id, pk.id)) {
          applied.push({ kind: "pack", pack_id: pk.id, status: "already_installed" });
          continue;
        }
        await opsMod.industry.install(org_id, pk.id, { actor, content: pk.content, source: "bundle" });
        applied.push({ kind: "pack", pack_id: pk.id, version: pk.version, projections: pk.projections, status: "installed" });
      } catch (e) {
        applied.push({ kind: "pack", pack_id: pk.id, status: "error", error: e.message });
      }
    }
  });

  const errors = applied.filter((a) => a.status === "error");
  const status = errors.length ? (errors.length === applied.length ? "failed" : "partial") : "applied";
  await store.update(COLLECTION, row.id, { status, applied, updated_at: store.nowISO() });
  await runtime.adminaudit.record({
    action: "sovereign_update_applied", actor, via: "guardian-cli", target: org_id,
    meta: { bundle: plan.manifest.id, version: plan.manifest.version, status, signature: plan.report.alg, key_id: plan.report.key_id, items: applied.length, migrations: plan.migrations.length },
  }).catch(() => {});
  runtime.log[status === "applied" ? "info" : "warn"]("sovereign_update_applied", { id: row.id, bundle: plan.manifest.id, version: plan.manifest.version, status, errors: errors.length });

  return {
    ...shape({ ...row, status, applied }),
    release: plan.manifest.version,
    notes: plan.notes,
    // (3) Migrations are reported for a DBA, never executed here.
    migrations_outstanding: store.backend() === "supabase" ? plan.migrations : [],
    migrations_note: plan.migrations.length
      ? (store.backend() === "supabase"
        ? "apply these SQL files deliberately with your DBA — Guardian OS does not execute DDL that arrived in a bundle"
        : "the local store has no schema to migrate; these files are informational on this deployment")
      : null,
  };
}

// ── Rollback ────────────────────────────────────────────────────────────────

/** Reverse an applied update using the plan captured before it ran. */
async function rollback(update_id, { actor = "operator", rt = null, ops = null } = {}) {
  const runtime = rt || require("../runtime");
  const opsMod = ops || require("../ops");
  const store = runtime.store;

  const row = shape(await store.findOne(COLLECTION, { id: update_id }));
  if (!row) throw new UpdateError(`update ${update_id} not found`);
  if (row.status === "rolled_back") return row;

  const undone = [];
  for (const p of (row.rollback_plan && row.rollback_plan.policies) || []) {
    try {
      await opsMod.govpolicy.rollback({ name: p.name, scope: p.scope, to_version: p.previous_version, actor });
      undone.push({ kind: "policy", name: p.name, scope: p.scope, restored_version: p.previous_version });
    } catch (e) {
      undone.push({ kind: "policy", name: p.name, scope: p.scope, status: "error", error: e.message });
    }
  }
  for (const pk of (row.rollback_plan && row.rollback_plan.packs) || []) {
    if (pk.was_installed || !row.org_id) continue;   // it was already there — leave it
    try { await opsMod.industry.uninstall(row.org_id, pk.pack_id, { actor }); undone.push({ kind: "pack", pack_id: pk.pack_id, status: "uninstalled" }); }
    catch (e) { undone.push({ kind: "pack", pack_id: pk.pack_id, status: "error", error: e.message }); }
  }

  await store.update(COLLECTION, update_id, { status: "rolled_back", rolled_back_at: store.nowISO(), undone, updated_at: store.nowISO() });
  await runtime.adminaudit.record({ action: "sovereign_update_rolled_back", actor, via: "guardian-cli", target: row.org_id, meta: { update_id, bundle: row.bundle_id, version: row.version, items: undone.length } }).catch(() => {});
  runtime.log.warn("sovereign_update_rolled_back", { id: update_id, bundle: row.bundle_id, version: row.version, items: undone.length });
  return { ...row, status: "rolled_back", undone };
}

/** Applied-update history, newest first. */
async function history({ org_id = null, limit = 50, rt = null } = {}) {
  const store = (rt || require("../runtime")).store;
  const rows = (await store.findOptional(COLLECTION, org_id ? { org_id } : {})).map(shape);
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return rows.slice(0, limit);
}

// ── Build (publisher side) ──────────────────────────────────────────────────

/**
 * Build an update bundle from declarative inputs. Used by `guardian bundle
 * update` and by the sovereign test suite; the publisher signs it, the
 * sovereign estate verifies it.
 */
function buildUpdate({ id, version, policies = [], packs = [], migrations = {}, notes = null, sign = null }) {
  const files = {};
  for (const p of policies) {
    const name = p.name || (p.spec && p.spec.name);
    if (!name) throw new UpdateError("every policy in an update needs a name");
    files[`${POLICY_PREFIX}${name}.json`] = JSON.stringify(p, null, 2) + "\n";
  }
  for (const pk of packs) {
    const content = typeof pk === "string" ? sovereignPacks.declarative(require("../ops/packs").get(pk)) : pk;
    sovereignPacks.validateContent(content);
    files[`${PACK_PREFIX}${content.id}.json`] = JSON.stringify(content, null, 2) + "\n";
  }
  for (const [name, sql] of Object.entries(migrations || {})) files[`${MIGRATION_PREFIX}${name}`] = sql;
  if (notes) files["notes.md"] = notes;
  return bundleFmt.build({
    kind: "update", id, version, sign,
    metadata: { policies: policies.length, packs: Object.keys(files).filter((f) => f.startsWith(PACK_PREFIX)).length, migrations: Object.keys(migrations || {}).length },
    files,
  });
}

module.exports = { COLLECTION, UpdateError, inspect, apply, rollback, history, buildUpdate, shape };
