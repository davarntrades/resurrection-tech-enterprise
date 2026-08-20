/* ============================================================================
 * Runtime Governance — tenant-scoped Supabase access.
 *
 * Hardened production requests use a short-lived, server-minted tenant JWT and
 * SUPABASE_ANON_KEY so PostgreSQL RLS is an actual runtime enforcement layer.
 * org_id comes from trusted authenticated identity, never a client parameter.
 * ============================================================================ */
"use strict";
const crypto = require("node:crypto");

class TenantIdentityError extends Error {
  constructor(code, message) { super(message); this.name = "TenantIdentityError"; this.code = code; }
}
const b64 = (value) => Buffer.from(value).toString("base64url");
function signHs256(payload, secret) {
  if (!secret) throw new TenantIdentityError("JWT_SECRET_MISSING", "SUPABASE_JWT_SECRET is required for tenant-scoped production database access");
  const header = { alg: "HS256", typ: "JWT" };
  const encoded = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`;
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}
function tenantClaims({ org_id, runtime_role = "tenant", subject = "runtime", ttl_seconds = 300, now = Math.floor(Date.now() / 1000) }) {
  if (!org_id || typeof org_id !== "string") throw new TenantIdentityError("ORG_REQUIRED", "trusted org_id is required");
  const ttl = Math.max(30, Math.min(900, Number(ttl_seconds) || 300));
  return Object.freeze({ aud: "authenticated", role: "authenticated", sub: String(subject || "runtime"), org_id, runtime_role: String(runtime_role || "tenant"), iat: now, exp: now + ttl });
}
function configured(env = process.env) {
  return !!(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_JWT_SECRET);
}
function createTenantClient(identity, env = process.env, deps = {}) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new TenantIdentityError("TENANT_DB_CONFIG_MISSING", "NEXT_PUBLIC_SUPABASE_URL + SUPABASE_ANON_KEY are required");
  const claims = tenantClaims(identity);
  const token = signHs256(claims, env.SUPABASE_JWT_SECRET);
  const createClient = deps.createClient || require("@supabase/supabase-js").createClient;
  const client = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return Object.freeze({ client, claims, token });
}
function assertTrustedOrg(auth, requestedOrg) {
  const trusted = auth && (auth.org_id || (auth.org && auth.org.id));
  if (!trusted) throw new TenantIdentityError("TRUSTED_ORG_MISSING", "authenticated server-side identity has no organisation");
  if (requestedOrg && requestedOrg !== trusted) throw new TenantIdentityError("ORG_SPOOF_ATTEMPT", "requested organisation does not match authenticated identity");
  return trusted;
}

const READ_SURFACES = Object.freeze([
  "rg_environments", "rg_manifest_versions", "rg_manifests", "rg_decisions",
  "rg_reports", "rg_alerts", "rg_integration_connectors", "rg_integration_events",
  "rg_ops_proposals", "rg_ops_evidence", "rg_runtime_resources", "rg_deployment_profiles",
]);

async function assertRuntimeScope({ org_id, environment_id, env = process.env, createClient } = {}) {
  if (!org_id || !environment_id) throw new TenantIdentityError("SCOPE_REQUIRED", "org_id + environment_id are required for production scope proof");
  const ctx = createTenantClient({ org_id, subject: `runtime:${environment_id}` }, env, { createClient });
  const { data, error } = await ctx.client.from("rg_environments").select("id,org_id").eq("id", environment_id).eq("org_id", org_id).limit(1);
  if (error) throw new TenantIdentityError("TENANT_SCOPE_READ_FAILED", error.message);
  if (!data || data.length !== 1) throw new TenantIdentityError("TENANT_SCOPE_DENIED", "RLS-constrained runtime identity cannot access the requested environment");
  return { ok: true, org_id, environment_id, path: "authenticated JWT + SUPABASE_ANON_KEY + PostgreSQL RLS" };
}

async function proveTenantBoundary({ orgA, orgB, env = process.env, createClient } = {}) {
  if (!orgA || !orgB || orgA === orgB) throw new TenantIdentityError("TWO_ORGS_REQUIRED", "two distinct test organisations are required");
  const a = createTenantClient({ org_id: orgA, subject: "preflight-a" }, env, { createClient });
  const b = createTenantClient({ org_id: orgB, subject: "preflight-b" }, env, { createClient });
  const checks = {};

  const readOrg = async (ctx, id) => {
    const { data, error } = await ctx.client.from("rg_orgs").select("id").eq("id", id);
    return error ? { ok: false, error: error.message } : { ok: true, rows: data || [] };
  };
  checks.a_reads_a = await readOrg(a, orgA);
  checks.a_reads_b = await readOrg(a, orgB);
  checks.b_reads_a = await readOrg(b, orgA);
  checks.b_reads_b = await readOrg(b, orgB);

  let ok = checks.a_reads_a.ok && checks.b_reads_b.ok
    && checks.a_reads_a.rows.length === 1 && checks.b_reads_b.rows.length === 1
    && checks.a_reads_b.ok && checks.b_reads_a.ok
    && checks.a_reads_b.rows.length === 0 && checks.b_reads_a.rows.length === 0;

  for (const table of READ_SURFACES) {
    for (const [label, ctx, org] of [["a", a, orgA], ["b", b, orgB]]) {
      const { data, error } = await ctx.client.from(table).select("org_id").limit(500);
      const result = error
        ? { ok: false, error: error.message }
        : { ok: (data || []).every((row) => row.org_id === org), rows: (data || []).length };
      checks[`${label}_${table}`] = result;
      ok = ok && result.ok;
    }
  }

  // Ordinary tenant role is read-only on these audit/control surfaces. A
  // cross-tenant mutation must therefore fail even before RLS could match it.
  const mutation = await a.client.from("rg_reports").update({ headline: "forbidden" }).eq("org_id", orgB).select("id");
  checks.a_mutates_b = { ok: !!mutation.error || !(mutation.data || []).length, error: mutation.error ? mutation.error.message : null };
  ok = ok && checks.a_mutates_b.ok;

  return {
    ok: !!ok,
    checks,
    surfaces: READ_SURFACES,
    path: "authenticated JWT + SUPABASE_ANON_KEY + PostgreSQL RLS",
  };
}

module.exports = {
  TenantIdentityError, READ_SURFACES,
  signHs256, tenantClaims, configured, createTenantClient,
  assertTrustedOrg, assertRuntimeScope, proveTenantBoundary,
};
