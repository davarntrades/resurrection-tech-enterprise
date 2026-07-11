/* ============================================================================
 * Runtime Governance — Engagement Management (operator CRM).
 *
 * Per-customer engagement record for the operator to run the managed service:
 * next review date, meeting cadence, delivery schedule, customer contacts, and
 * running notes. This is an OPERATOR-ONLY surface (Control Room) — it is never
 * exposed to customers and has no customer-facing route. Pure store-backed data.
 *
 * One engagement record per org (upserted). Reuses the shared store.
 * ============================================================================ */
"use strict";
const crypto = require("node:crypto");
const store = require("./store");

const CADENCES = ["weekly", "biweekly", "monthly", "quarterly", "ad_hoc"];
const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const clean = (s, max = 2000) => String(s == null ? "" : s).trim().slice(0, max);
const norm = (v, allowed, fallback) => (allowed.includes(String(v)) ? String(v) : fallback);

// Coerce a date-ish input to an ISO date (YYYY-MM-DD) or null.
function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function shape(r, org_id) {
  if (!r) return { org_id, next_review_date: null, cadence: "monthly", delivery_schedule: "", contacts: [], notes: [], last_review_date: null, configured: false, updated_at: null };
  return {
    org_id: r.org_id,
    next_review_date: r.next_review_date || null,
    last_review_date: r.last_review_date || null,
    cadence: norm(r.cadence, CADENCES, "monthly"),
    delivery_schedule: r.delivery_schedule || "",
    contacts: Array.isArray(r.contacts) ? r.contacts : [],
    notes: Array.isArray(r.notes) ? r.notes : [],
    configured: true,
    updated_at: r.updated_at || null,
  };
}

async function get(org_id) {
  const row = await store.findOne("engagements", { org_id }).catch(() => null);
  return shape(row, org_id);
}

async function raw(org_id) {
  return store.findOne("engagements", { org_id }).catch(() => null);
}

async function ensure(org_id) {
  let row = await raw(org_id);
  if (!row) row = await store.insert("engagements", { org_id, cadence: "monthly", delivery_schedule: "", contacts: [], notes: [], next_review_date: null, last_review_date: null, updated_at: store.nowISO() });
  return row;
}

// Upsert top-level engagement fields (not contacts/notes — those have their own
// helpers so concurrent edits don't clobber the list).
async function set(org_id, patch = {}) {
  if (!org_id) throw new Error("org_id is required");
  const row = await ensure(org_id);
  const next = { updated_at: store.nowISO() };
  if (patch.next_review_date !== undefined) next.next_review_date = toDate(patch.next_review_date);
  if (patch.last_review_date !== undefined) next.last_review_date = toDate(patch.last_review_date);
  if (patch.cadence !== undefined) next.cadence = norm(patch.cadence, CADENCES, row.cadence || "monthly");
  if (patch.delivery_schedule !== undefined) next.delivery_schedule = clean(patch.delivery_schedule, 500);
  await store.update("engagements", row.id, next);
  return get(org_id);
}

async function addContact(org_id, { name, email, role } = {}) {
  const row = await ensure(org_id);
  const contacts = Array.isArray(row.contacts) ? row.contacts.slice() : [];
  const e = clean(email, 200).toLowerCase();
  const contact = { id: crypto.randomBytes(6).toString("hex"), name: clean(name, 200), email: emailRe.test(e) ? e : "", role: clean(role, 120) };
  if (!contact.name && !contact.email) throw new Error("contact needs a name or email");
  contacts.push(contact);
  await store.update("engagements", row.id, { contacts, updated_at: store.nowISO() });
  return get(org_id);
}

async function removeContact(org_id, contact_id) {
  const row = await ensure(org_id);
  const contacts = (Array.isArray(row.contacts) ? row.contacts : []).filter((c) => c.id !== contact_id);
  await store.update("engagements", row.id, { contacts, updated_at: store.nowISO() });
  return get(org_id);
}

async function addNote(org_id, text) {
  const t = clean(text, 4000);
  if (!t) throw new Error("note text is required");
  const row = await ensure(org_id);
  const notes = Array.isArray(row.notes) ? row.notes.slice() : [];
  notes.unshift({ id: crypto.randomBytes(6).toString("hex"), at: store.nowISO(), text: t });
  await store.update("engagements", row.id, { notes, updated_at: store.nowISO() });
  return get(org_id);
}

// Orgs whose next review is due on/before `asOf` (operator awareness). Sorted
// soonest-first. Orgs without a next_review_date are excluded.
async function dueForReview(asOf = new Date()) {
  const cutoff = toDate(asOf);
  const rows = await store.find("engagements", {}).catch(() => []);
  return rows
    .filter((r) => r.next_review_date && r.next_review_date <= cutoff)
    .map((r) => ({ org_id: r.org_id, next_review_date: r.next_review_date, cadence: r.cadence || "monthly" }))
    .sort((a, b) => String(a.next_review_date).localeCompare(String(b.next_review_date)));
}

module.exports = { CADENCES, get, set, addContact, removeContact, addNote, dueForReview };
