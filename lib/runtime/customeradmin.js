/* ============================================================================
 * Runtime Governance — customer lifecycle controls (operator-only).
 *
 * Archive / Restore. Archiving pauses a customer WITHOUT destroying anything:
 * the org leaves the active list, ingest credentials are disabled (so no new
 * evaluations can be recorded), and customer notifications stop — while ALL
 * historical evidence, evaluations, reports, audit packs, deliverables,
 * Evidence Hub, recommendations, engagement, and the operator audit trail are
 * preserved untouched. Restore reverses the reversible parts safely.
 *
 * Operator-only (the Control Room is behind operator auth). Customers never see
 * these controls. Permanent deletion is a separate, guarded operation (PR4).
 * ============================================================================ */
"use strict";
const store = require("./store");
const admin = require("./admin");
const notify = require("./notify");

// Ingest keys that were active at archive time are parked as "archived" (not
// "revoked"), so Restore can reactivate exactly those — and operator-revoked
// keys stay revoked. authenticate() only accepts status === "active".
async function archive(org_id) {
  const org = await admin.getOrg(org_id);
  if (!org) throw new Error("organisation not found");
  if (org.status === "archived") return { ok: true, already: true, org_id };

  const keys = await store.find("api_keys", { org_id }).catch(() => []);
  let archived_keys = 0;
  for (const k of keys) {
    if ((k.status || "active") === "active") {
      await store.update("api_keys", k.id, { status: "archived", archived_at: store.nowISO() });
      archived_keys += 1;
    }
  }

  // Stop customer notifications (preserve recipients/events for a clean resume).
  let notifications_disabled = false;
  try {
    const prefs = await notify.getPrefs(org_id);
    if (prefs.enabled) { await notify.setPrefs(org_id, { enabled: false }); notifications_disabled = true; }
  } catch { /* prefs optional */ }

  await store.update("orgs", org_id, { status: "archived", archived_at: store.nowISO() });
  return { ok: true, org_id, archived_keys, notifications_disabled };
}

async function restore(org_id) {
  const org = await admin.getOrg(org_id);
  if (!org) throw new Error("organisation not found");
  if (org.status !== "archived") return { ok: true, already: true, org_id };

  // Reactivate exactly the keys parked by archive() — not operator-revoked ones.
  const keys = await store.find("api_keys", { org_id }).catch(() => []);
  let reactivated_keys = 0;
  for (const k of keys) {
    if (k.status === "archived") {
      await store.update("api_keys", k.id, { status: "active", archived_at: null });
      reactivated_keys += 1;
    }
  }

  await store.update("orgs", org_id, { status: "active", archived_at: null });
  // Notifications are intentionally left disabled — the operator re-enables them
  // deliberately (recipients/events were preserved).
  return { ok: true, org_id, reactivated_keys, notifications_note: "customer alerts remain off until re-enabled" };
}

// Archived orgs + a small summary of what is preserved (for the Restore UI).
async function listArchived() {
  const orgs = (await store.find("orgs", {}).catch(() => [])).filter((o) => o.status === "archived");
  const out = [];
  for (const org of orgs) {
    const [reps, packs, recs] = await Promise.all([
      store.find("reports", { org_id: org.id }).catch(() => []),
      store.find("audit_packs", { org_id: org.id }).catch(() => []),
      store.find("recommendations", { org_id: org.id }).catch(() => []),
    ]);
    out.push({
      id: org.id, name: org.name, slug: org.slug || null, plan: org.plan || "pilot",
      archived_at: org.archived_at || null,
      preserved: { reports: reps.length, audit_packs: packs.length, recommendations: recs.length },
    });
  }
  return out.sort((a, b) => String(b.archived_at).localeCompare(String(a.archived_at)));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Permanent deletion (test organisations). Irreversible. Operator-only.
 *
 * Deletes ALL organisation-scoped records explicitly and org-scoped — never a
 * global delete — because most tables have no ON DELETE CASCADE to rg_orgs and
 * the file backend has no cascades at all. The one thing NOT deleted is the
 * operator audit trail (rg_admin_audit): it is the permanent record that the
 * org existed and was deleted, and a deletion entry is written before we start.
 * ──────────────────────────────────────────────────────────────────────────── */

// Every organisation-scoped collection, deepest child first so foreign keys are
// respected on Supabase (the file backend is order-independent). `key` is the
// where-filter field; all are org_id except the org row itself.
const ORG_CHILD_COLLECTIONS = [
  "integration_webhook_deliveries",
  "integration_webhooks",
  "integration_connectors",
  "integration_deployments",
  "integration_usage",
  "integration_events",
  "integration_secrets",
  "shares",             // → deliverables
  "deliverables",       // → audit_packs
  "audit_packs",
  "decisions",          // evaluations / runtime evidence
  "reports",
  "chain_heads",
  "manifest_versions",  // → manifests
  "manifests",
  "alerts",
  "hubs",
  "notify_prefs",
  "recommendations",
  "engagements",
  "api_keys",           // ingest credentials
  "environments",
];

// Count everything that references an org — the dependency map / delete preview.
async function dependencyMap(org_id) {
  const org = await admin.getOrg(org_id);
  if (!org) throw new Error("organisation not found");
  const countOf = async (c) =>
    c === "decisions"
      ? (await store.queryDecisions({ org_id, limit: 1000000 }).catch(() => [])).length
      : (await store.find(c, { org_id }).catch(() => [])).length;
  const counts = {};
  for (const c of ORG_CHILD_COLLECTIONS) counts[c] = await countOf(c);
  // Operator audit entries reference the org via `target`; PRESERVED on delete.
  const operator_audit_entries = (await store.find("admin_audit", { target: org_id }).catch(() => [])).length;
  return {
    org: { id: org.id, name: org.name, slug: org.slug || null, status: org.status || "active" },
    counts,
    total_records: Object.values(counts).reduce((a, b) => a + b, 0),
    preserved: { operator_audit_entries },
  };
}

// Permanently delete a test organisation. `confirm` MUST equal the org's exact
// name or slug. Fails closed: aborts on the first cleanup error and reports it.
async function permanentDelete(org_id, { confirm } = {}) {
  const org = await admin.getOrg(org_id);
  if (!org) throw new Error("organisation not found");

  // Typed-confirmation gate (also enforced at the API layer).
  const c = String(confirm == null ? "" : confirm).trim();
  if (!c || (c !== org.name && c !== (org.slug || "\0"))) {
    throw new Error("confirmation does not match the organisation name or slug");
  }

  const map = await dependencyMap(org_id);

  // Operator audit record BEFORE deletion (best-effort, but attempted first so
  // the intent + dependency snapshot survive the org itself).
  let audit_recorded = false;
  try {
    await require("./adminaudit").record({ action: "delete_customer", target: org_id, meta: { name: org.name, slug: org.slug || null, counts: map.counts, total: map.total_records } });
    audit_recorded = true;
  } catch { /* proceed — deletion should not be blocked by the audit sink */ }

  const step = async (label, fn) => {
    try { return await fn(); }
    catch (e) { const err = new Error(`cleanup failed at ${label}: ${e && e.message ? e.message : e}`); err.failed_step = label; err.audit_recorded = audit_recorded; throw err; }
  };

  // 1) Revoke-first — cut all live customer access before deleting anything.
  //    Fail closed: if any revoke fails we stop before destroying rows.
  await step("revoke:api_keys", async () => { for (const k of await store.find("api_keys", { org_id })) await store.update("api_keys", k.id, { status: "revoked" }); });
  await step("revoke:hubs", async () => { for (const h of await store.find("hubs", { org_id })) await store.update("hubs", h.id, { revoked: true }); });
  await step("revoke:shares", async () => { for (const s of await store.find("shares", { org_id })) await store.update("shares", s.id, { revoked: true }); });

  // 2) Delete deliverable blobs from storage (best-effort per object).
  await step("storage:deliverables", async () => {
    for (const d of await store.find("deliverables", { org_id })) if (d.storage_path) await store.storageRemove(d.storage_path);
  });

  // 3) Delete every org-scoped child record (deepest child first), org last.
  const deleted = {};
  for (const c of ORG_CHILD_COLLECTIONS) {
    deleted[c] = await step(`delete:${c}`, () => store.remove(c, { org_id }));
  }
  deleted.orgs = await step("delete:orgs", () => store.remove("orgs", { id: org_id }));

  return { ok: true, org_id, name: org.name, deleted, total_deleted: map.total_records, audit_recorded, preserved: map.preserved };
}

module.exports = { archive, restore, listArchived, dependencyMap, permanentDelete, ORG_CHILD_COLLECTIONS };
