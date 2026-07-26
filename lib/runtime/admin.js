/* ============================================================================
 * Runtime Governance — enterprise administration (tenancy + auth).
 *
 * Orgs → environments → API keys, with role-based scopes. This is the layer
 * that lets Resurrection Tech onboard a customer the instant they approve after
 * an audit: one call provisions an org, production + staging + sandbox
 * environments, and scoped production/test credentials.
 *
 *   Roles:  ingest  → may POST trajectories to /runtime/evaluate for its env
 *           viewer  → read-only dashboards / reports / history
 *           admin   → manage manifests, environments, keys within its org
 *   Keys are shown ONCE at creation; only a sha256 hash is stored.
 * ============================================================================ */
"use strict";
const crypto = require("node:crypto");
const store = require("./store");

const ROLES = ["ingest", "viewer", "admin"];
const MODES = ["shadow", "enforce"];          // per-environment governance mode
const KINDS = ["production", "staging", "sandbox"]; // environment kind

function genKey(kind = "production") {
  // Sandbox credentials are visually distinct so they cannot be mistaken for
  // production secrets. Only the prefix + hash are persisted.
  const secret = crypto.randomBytes(24).toString("hex");
  return `rtk_${kind === "sandbox" ? "test" : "live"}_${secret}`;
}

// ── Organisations ────────────────────────────────────────────────────────────
async function createOrg({ name, slug, plan = "pilot" }) {
  const existing = slug ? await store.findOne("orgs", { slug }) : null;
  if (existing) return existing;
  return store.insert("orgs", { name, slug: slug || String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-"), plan, status: "active" });
}
async function getOrg(org_id) { return store.findOne("orgs", { id: org_id }); }
async function listOrgs() { return store.find("orgs"); }

// ── Environments (production / staging separation, shadow / enforce mode) ─────
async function createEnvironment({ org_id, kind = "production", mode = "shadow", name, store_payloads = false }) {
  if (!KINDS.includes(kind)) throw new Error(`invalid environment kind: ${kind}`);
  if (!MODES.includes(mode)) throw new Error(`invalid mode: ${mode}`);
  // store_payloads (default OFF): when a customer opts in, the gateway retains
  // the full trajectory (args included) so any decision can be reproduced
  // EXACTLY for audit / determinism proof. Off = metadata-only (privacy-first).
  return store.insert("environments", { org_id, kind, mode, name: name || `${kind}`, store_payloads: !!store_payloads, status: "active" });
}
async function setStorePayloads(environment_id, on) {
  await store.update("environments", environment_id, { store_payloads: !!on });
  return getEnvironment(environment_id);
}
async function listEnvironments(org_id) { return store.find("environments", { org_id }); }
async function getEnvironment(environment_id) { return store.findOne("environments", { id: environment_id }); }
// Rollback / cutover is a mode flip on the environment — no redeploy, instant.
async function setMode(environment_id, mode) {
  if (!MODES.includes(mode)) throw new Error(`invalid mode: ${mode}`);
  await store.update("environments", environment_id, { mode, mode_changed_at: store.nowISO() });
  return getEnvironment(environment_id);
}

// ── API keys (hashed, scoped) ────────────────────────────────────────────────
async function issueApiKey({
  org_id, environment_id = null, role = "ingest", label = "",
  scopes = null, expires_at = null, environment_restrictions = null,
}) {
  if (!ROLES.includes(role)) throw new Error(`invalid role: ${role}`);
  const environment = environment_id ? await getEnvironment(environment_id) : null;
  if (environment_id && (!environment || environment.org_id !== org_id))
    throw new Error("environment does not belong to organisation");
  const key = genKey(environment ? environment.kind : "production");
  const rec = await store.insert("api_keys", {
    org_id, environment_id, role, label,
    scopes: Array.isArray(scopes) ? [...new Set(scopes.map(String))] : null,
    environment_restrictions: Array.isArray(environment_restrictions) ? [...new Set(environment_restrictions.map(String))] : null,
    expires_at: expires_at || null,
    prefix: key.slice(0, 13), key_hash: store.sha256(key), status: "active", last_used_at: null,
  });
  // The plaintext key is returned ONCE and never persisted.
  return { key, record: { ...rec, key_hash: undefined } };
}
async function revokeApiKey(key_id) { await store.update("api_keys", key_id, { status: "revoked" }); }
async function rotateApiKey(key_id, overrides = {}) {
  const current = await store.findOne("api_keys", { id: key_id });
  if (!current || current.status !== "active") throw new Error("active API key not found");
  // Issue first, revoke second: a failed issue never strands the customer.
  const issued = await issueApiKey({
    org_id: current.org_id,
    environment_id: current.environment_id || null,
    role: overrides.role || current.role,
    label: overrides.label || current.label || "rotated credential",
    scopes: overrides.scopes || current.scopes || null,
    expires_at: overrides.expires_at || current.expires_at || null,
    environment_restrictions: overrides.environment_restrictions || current.environment_restrictions || null,
  });
  await store.update("api_keys", key_id, { status: "revoked", revoked_at: store.nowISO(), rotated_to: issued.record.id });
  return issued;
}
async function listApiKeys(org_id) {
  return (await store.find("api_keys", { org_id })).map((k) => ({ ...k, key_hash: undefined }));
}

// Authenticate a presented key → { org, environment, role } or null.
async function authenticate(presentedKey, { requireRole } = {}) {
  if (!presentedKey) return null;
  const hash = store.sha256(String(presentedKey).trim());
  const rec = await store.findOne("api_keys", { key_hash: hash });
  if (!rec || rec.status !== "active") return null;
  if (rec.expires_at && Date.parse(rec.expires_at) <= Date.now()) return null;
  if (requireRole) {
    const rank = { viewer: 1, ingest: 2, admin: 3 };
    // ingest and viewer are siblings; require exact capability unless admin.
    const ok = rec.role === "admin" || rec.role === requireRole ||
      (requireRole === "viewer" && rec.role !== "revoked");
    if (!ok) return null;
  }
  const org = await store.findOne("orgs", { id: rec.org_id });
  // Archived customers cannot ingest even if a key somehow remained active
  // (archive() parks keys as "archived", so this is defence-in-depth).
  if (!org || org.status === "archived") return null;
  store.update("api_keys", rec.id, { last_used_at: store.nowISO() }).catch(() => {});
  const environment = rec.environment_id ? await store.findOne("environments", { id: rec.environment_id }) : null;
  return {
    org, environment, role: rec.role, scopes: rec.scopes || null,
    environment_restrictions: rec.environment_restrictions || null, key_id: rec.id,
  };
}

// ── One-shot onboarding: customer says "yes" → ready to integrate ────────────
// Provisions the org, production + staging + sandbox, plus production and test
// credentials. Plaintext credentials are returned ONCE.
async function onboardCustomer({ name, slug, plan = "pilot" }) {
  const org = await createOrg({ name, slug, plan });
  let envs = await listEnvironments(org.id);
  if (!envs.length) {
    await createEnvironment({ org_id: org.id, kind: "production", mode: "shadow", name: "production" });
    await createEnvironment({ org_id: org.id, kind: "staging", mode: "shadow", name: "staging" });
    await createEnvironment({ org_id: org.id, kind: "sandbox", mode: "shadow", name: "sandbox" });
    envs = await listEnvironments(org.id);
  } else if (!envs.some((e) => e.kind === "sandbox")) {
    await createEnvironment({ org_id: org.id, kind: "sandbox", mode: "shadow", name: "sandbox" });
    envs = await listEnvironments(org.id);
  }
  const prod = envs.find((e) => e.kind === "production");
  const sandbox = envs.find((e) => e.kind === "sandbox");
  const issued = await issueApiKey({ org_id: org.id, environment_id: prod.id, role: "ingest", label: "production ingest" });
  const test = await issueApiKey({
    org_id: org.id, environment_id: sandbox.id, role: "admin", label: "sandbox integration",
    scopes: [
      "runtime:write", "runtime:read", "integrations:read", "integrations:manage",
      "webhooks:read", "webhooks:manage", "credentials:read", "credentials:manage",
      "deployments:read", "deployments:manage", "evidence:read", "evidence:write",
    ],
  });
  return {
    org, environments: envs, production: prod, sandbox,
    ingest_key: issued.key, api_key_record: issued.record,
    sandbox_key: test.key, sandbox_api_key_record: test.record,
  };
}

module.exports = {
  ROLES, MODES, KINDS,
  createOrg, getOrg, listOrgs,
  createEnvironment, listEnvironments, getEnvironment, setMode, setStorePayloads,
  issueApiKey, rotateApiKey, revokeApiKey, listApiKeys, authenticate,
  onboardCustomer,
};
