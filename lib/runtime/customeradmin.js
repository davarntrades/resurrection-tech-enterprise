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

module.exports = { archive, restore, listArchived };
