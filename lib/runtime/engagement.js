/* ============================================================================
 * Runtime Governance — Engagement Management (operator CRM).
 *
 * Per-customer engagement record for the operator to run the managed service:
 * next review date, meeting cadence, delivery schedule, customer contacts, and
 * running notes. This is an OPERATOR-ONLY surface (Control Room) — it is never
 * exposed to customers and has no customer-facing route. Pure store-backed data.
 *
 * Sovereign is an ENGAGEMENT MODE, not a second governance engine. Turning it
 * on preserves every standard Audit/Pilot/Integration/Managed-Service feature
 * and adds deployment-bound assurance/evidence requirements around the same
 * Morrison Runtime Governance semantics.
 * ============================================================================ */
"use strict";
const crypto = require("node:crypto");
const store = require("./store");

const CADENCES = ["weekly", "biweekly", "monthly", "quarterly", "ad_hoc"];
const STAGES = [
  { key: "prospect", label: "Prospect" },
  { key: "audit", label: "48-Hour Audit" },
  { key: "enterprise_assessment", label: "Enterprise Assessment" },
  { key: "limited_pilot", label: "Limited Pilot" },
  { key: "enterprise_integration", label: "Enterprise Integration" },
  { key: "managed_service", label: "Managed Service" },
];
const STAGE_KEYS = STAGES.map((s) => s.key);

const DEPLOYMENT_MODES = ["standard", "sovereign"];
const SOVEREIGN_PROFILES = [
  { key: "customer_cloud", label: "Customer-controlled cloud" },
  { key: "on_prem", label: "On-premises" },
  { key: "sovereign_cloud", label: "Sovereign cloud" },
  { key: "air_gapped", label: "Air-gapped" },
];
const SOVEREIGN_PROFILE_KEYS = SOVEREIGN_PROFILES.map((p) => p.key);

const STANDARD_FEATURES = Object.freeze([
  "Runtime governance evidence",
  "Monthly governance evidence",
  "Executive summaries",
  "48-Hour Audit and assessment evidence",
  "Limited Pilot evidence",
  "Secure evidence publishing and sharing",
  "Customer notification and review cadence",
]);
const SOVEREIGN_FEATURES = Object.freeze([
  ...STANDARD_FEATURES,
  "Sovereign monthly evidence annex",
  "Deployment-profile verification",
  "Operational-authority and policy-source evidence",
  "Evidence-residency and storage-boundary evidence",
  "Egress and provider-boundary evidence",
  "Customer-controlled credential evidence",
  "Trust-store and signing-key readiness",
  "Offline update and rollback evidence where applicable",
  "Sovereign audit / pilot closeout reporting",
]);

const PROFILE_REQUIREMENTS = Object.freeze({
  customer_cloud: [
    "customer-controlled policy authority",
    "customer-controlled credentials",
    "declared evidence residency",
    "approved outbound endpoints",
    "deployment identity and provenance",
  ],
  on_prem: [
    "local policy authority",
    "customer-controlled credentials",
    "local evidence storage",
    "restricted egress",
    "signed policy/update trust path",
    "rollback evidence",
  ],
  sovereign_cloud: [
    "sovereign policy authority",
    "customer/national credential control",
    "sovereign evidence residency",
    "approved sovereign endpoints",
    "signed policy/update trust path",
    "deployment identity and provenance",
  ],
  air_gapped: [
    "local policy authority",
    "local evidence storage",
    "no network-reachable write path",
    "out-of-band trust-store provisioning",
    "signed offline updates",
    "rollback evidence",
  ],
});

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const clean = (s, max = 2000) => String(s == null ? "" : s).trim().slice(0, max);
const norm = (v, allowed, fallback) => (allowed.includes(String(v)) ? String(v) : fallback);

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function stageLabel(stage) { return (STAGES.find((s) => s.key === stage) || STAGES[0]).label; }
function profileLabel(profile) { return (SOVEREIGN_PROFILES.find((p) => p.key === profile) || SOVEREIGN_PROFILES[0]).label; }

function shape(r, org_id) {
  const base = r || {};
  const stage = norm(base.stage, STAGE_KEYS, "prospect");
  const deployment_mode = norm(base.deployment_mode, DEPLOYMENT_MODES, "standard");
  const sovereign_profile = norm(base.sovereign_profile, SOVEREIGN_PROFILE_KEYS, "customer_cloud");
  const sovereign = deployment_mode === "sovereign";
  return {
    org_id: base.org_id || org_id,
    stage,
    stage_label: stageLabel(stage),
    next_review_date: base.next_review_date || null,
    last_review_date: base.last_review_date || null,
    cadence: norm(base.cadence, CADENCES, "monthly"),
    delivery_schedule: base.delivery_schedule || "",
    deployment_mode,
    sovereign,
    sovereign_profile,
    sovereign_profile_label: profileLabel(sovereign_profile),
    sovereign_enabled_at: base.sovereign_enabled_at || null,
    features: sovereign ? SOVEREIGN_FEATURES : STANDARD_FEATURES,
    sovereign_requirements: sovereign ? (PROFILE_REQUIREMENTS[sovereign_profile] || []) : [],
    evidence_cadence: sovereign ? "monthly sovereign evidence + standard evidence" : "standard engagement evidence",
    governance_semantics_changed: false,
    contacts: Array.isArray(base.contacts) ? base.contacts : [],
    notes: Array.isArray(base.notes) ? base.notes : [],
    configured: !!r,
    updated_at: base.updated_at || null,
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
  if (!row) row = await store.insert("engagements", {
    org_id,
    stage: "prospect",
    cadence: "monthly",
    delivery_schedule: "",
    deployment_mode: "standard",
    sovereign_profile: "customer_cloud",
    sovereign_enabled_at: null,
    contacts: [], notes: [], next_review_date: null, last_review_date: null,
    updated_at: store.nowISO(),
  });
  return row;
}

async function set(org_id, patch = {}) {
  if (!org_id) throw new Error("org_id is required");
  const row = await ensure(org_id);
  const next = { updated_at: store.nowISO() };
  if (patch.stage !== undefined) {
    if (!STAGE_KEYS.includes(String(patch.stage))) throw new Error(`invalid engagement stage: ${patch.stage}`);
    next.stage = String(patch.stage);
  }
  if (patch.next_review_date !== undefined) next.next_review_date = toDate(patch.next_review_date);
  if (patch.last_review_date !== undefined) next.last_review_date = toDate(patch.last_review_date);
  if (patch.cadence !== undefined) next.cadence = norm(patch.cadence, CADENCES, row.cadence || "monthly");
  if (patch.delivery_schedule !== undefined) next.delivery_schedule = clean(patch.delivery_schedule, 500);
  if (patch.sovereign_profile !== undefined) {
    if (!SOVEREIGN_PROFILE_KEYS.includes(String(patch.sovereign_profile))) throw new Error(`invalid sovereign profile: ${patch.sovereign_profile}`);
    next.sovereign_profile = String(patch.sovereign_profile);
  }
  if (patch.deployment_mode !== undefined) {
    const mode = String(patch.deployment_mode);
    if (!DEPLOYMENT_MODES.includes(mode)) throw new Error(`invalid deployment mode: ${mode}`);
    next.deployment_mode = mode;
    if (mode === "sovereign" && row.deployment_mode !== "sovereign") next.sovereign_enabled_at = store.nowISO();
    if (mode === "standard") next.sovereign_enabled_at = null;
  }
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

async function dueForReview(asOf = new Date()) {
  const cutoff = toDate(asOf);
  const rows = await store.find("engagements", {}).catch(() => []);
  return rows
    .filter((r) => r.next_review_date && r.next_review_date <= cutoff)
    .map((r) => ({ org_id: r.org_id, next_review_date: r.next_review_date, cadence: r.cadence || "monthly", deployment_mode: r.deployment_mode || "standard" }))
    .sort((a, b) => String(a.next_review_date).localeCompare(String(b.next_review_date)));
}

module.exports = {
  CADENCES, STAGES, STAGE_KEYS, DEPLOYMENT_MODES, SOVEREIGN_PROFILES,
  STANDARD_FEATURES, SOVEREIGN_FEATURES, PROFILE_REQUIREMENTS,
  stageLabel, profileLabel, get, set, addContact, removeContact, addNote, dueForReview,
};
