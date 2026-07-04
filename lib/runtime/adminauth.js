/* ============================================================================
 * Runtime Governance — operator authentication (admin dashboard, Phase 1).
 *
 * The control-room surface needs a real login, not an admin key pasted into a
 * browser. This issues short-lived, HMAC-signed session tokens and provides a
 * single guard used by every admin route.
 *
 *   login(password)                 → verifies the operator password, mints a token
 *   verifyToken(token)              → decoded payload or null (signature + expiry)
 *   authorize({ sessionToken, adminKey })
 *                                   → { ok, identity, via } — a valid SESSION cookie
 *                                     OR the x-admin-key header (kept for curl/CLI)
 *
 * Config (all optional; sessions degrade off cleanly if unset):
 *   RUNTIME_OPERATOR_PASSWORD  operator login password (falls back to RUNTIME_ADMIN_KEY)
 *   RUNTIME_SESSION_SECRET     HMAC secret (falls back to a value derived from RUNTIME_ADMIN_KEY)
 *   RUNTIME_SESSION_TTL_SEC    session lifetime, default 43200 (12h)
 *
 * The engine is never touched — this is operator-surface auth only.
 * ============================================================================ */
"use strict";
const crypto = require("node:crypto");

const SESSION_COOKIE = "rg_admin_session";
const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

function ttlSec() {
  const n = Number(process.env.RUNTIME_SESSION_TTL_SEC);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 43200; // 12h
}
function operatorPassword() { return process.env.RUNTIME_OPERATOR_PASSWORD || process.env.RUNTIME_ADMIN_KEY || ""; }
function sessionSecret() {
  if (process.env.RUNTIME_SESSION_SECRET) return process.env.RUNTIME_SESSION_SECRET;
  if (process.env.RUNTIME_ADMIN_KEY) return crypto.createHash("sha256").update("rg-session:" + process.env.RUNTIME_ADMIN_KEY).digest("hex");
  return ""; // no secret available → sessions disabled
}
// Login is possible only when both a password and a signing secret exist.
function configured() { return !!operatorPassword() && !!sessionSecret(); }

// Constant-time string compare (length-safe).
function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ba, bb); } catch { return false; }
}

function sign(payloadB64, secret) {
  return b64url(crypto.createHmac("sha256", secret).update(payloadB64).digest());
}

// Mint a signed token for a verified operator. Returns null if not configured.
function issueToken(sub = "operator") {
  const secret = sessionSecret();
  if (!secret) return null;
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub, iat: now, exp: now + ttlSec() };
  const payloadB64 = b64url(JSON.stringify(payload));
  return { token: `${payloadB64}.${sign(payloadB64, secret)}`, exp: payload.exp };
}

// Verify a token's signature + expiry. Returns the payload or null.
function verifyToken(token) {
  const secret = sessionSecret();
  if (!secret || typeof token !== "string" || token.indexOf(".") < 0) return null;
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  if (!safeEqual(sig, sign(payloadB64, secret))) return null;         // tamper / wrong secret
  let payload; try { payload = JSON.parse(fromB64url(payloadB64).toString("utf8")); } catch { return null; }
  if (!payload || typeof payload.exp !== "number") return null;
  if (Math.floor(Date.now() / 1000) >= payload.exp) return null;      // expired
  return payload;
}

// Verify the operator password and mint a session. { ok, token, exp, maxAgeSec } | { ok:false, error }.
function login(password) {
  if (!configured()) return { ok: false, error: "operator login not configured (set RUNTIME_ADMIN_KEY or RUNTIME_OPERATOR_PASSWORD)" };
  if (!password || !safeEqual(password, operatorPassword())) return { ok: false, error: "invalid credentials" };
  const t = issueToken("operator");
  if (!t) return { ok: false, error: "session secret unavailable" };
  return { ok: true, token: t.token, exp: t.exp, maxAgeSec: t.exp - Math.floor(Date.now() / 1000) };
}

// The single guard for admin routes. Accepts a valid SESSION token (browser) OR
// the x-admin-key header (curl/CLI/back-compat). Returns identity or not-ok.
function authorize({ sessionToken, adminKey } = {}) {
  const payload = sessionToken ? verifyToken(sessionToken) : null;
  if (payload) return { ok: true, identity: payload.sub || "operator", via: "session" };
  if (adminKey && process.env.RUNTIME_ADMIN_KEY && safeEqual(adminKey, process.env.RUNTIME_ADMIN_KEY))
    return { ok: true, identity: "admin-key", via: "admin-key" };
  return { ok: false };
}

module.exports = { SESSION_COOKIE, configured, login, verifyToken, authorize, issueToken, ttlSec };
