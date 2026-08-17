/* ============================================================================
 * Runtime Governance — tenant-scoped Supabase access.
 *
 * Production tenant reads/writes must not rely on SUPABASE_SERVICE_ROLE_KEY.
 * This module mints a short-lived server-side JWT containing the trusted org_id
 * and uses SUPABASE_ANON_KEY so PostgreSQL RLS is actually in the request path.
 *
 * The caller MUST pass org_id derived from authenticated runtime identity
 * (API-key/session lookup), never from an untrusted request body.
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
  return Object.freeze({
    aud: "authenticated",
    role: "authenticated",
    sub: String(subject || "runtime"),
    org_id,
    runtime_role: String(runtime_role || "tenant"),
    iat: now,
    exp: now + ttl,
  });
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

async function proveTenantBoundary({ orgA, orgB, env = process.env, createClient } = {}) {
  if (!orgA || !orgB || orgA === orgB) throw new TenantIdentityError("TWO_ORGS_REQUIRED", "two distinct test organisations are required");
  const a = createTenantClient({ org_id: orgA, subject: "preflight-a" }, env, { createClient });
  const b = createTenantClient({ org_id: orgB, subject: "preflight-b" }, env, { createClient });

  const read = async (ctx, table, id) => {
    const { data, error } = await ctx.client.from(table).select("id,org_id").eq("id", id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, rows: data || [] };
  };

  const aSeesA = await read(a, "rg_orgs", orgA);
  const aSeesB = await read(a, "rg_orgs", orgB);
  const bSeesA = await read(b, "rg_orgs", orgA);
  const bSeesB = await read(b, "rg_orgs", orgB);
  return {
    ok: !!(aSeesA.ok && bSeesB.ok && aSeesA.rows.length === 1 && bSeesB.rows.length === 1 && aSeesB.ok && bSeesA.ok && aSeesB.rows.length === 0 && bSeesA.rows.length === 0),
    checks: { a_reads_a: aSeesA, a_reads_b: aSeesB, b_reads_a: bSeesA, b_reads_b: bSeesB },
    path: "authenticated JWT + SUPABASE_ANON_KEY + PostgreSQL RLS",
  };
}

module.exports = {
  TenantIdentityError,
  signHs256,
  tenantClaims,
  configured,
  createTenantClient,
  assertTrustedOrg,
  proveTenantBoundary,
};
