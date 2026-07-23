/* ============================================================================
 * Operations Agent — Gmail integration (READ-ONLY inbox monitoring, v1).
 *
 * Turns the operator's inbox into evidence-backed observations. It is read-only
 * by construction, enforced at four independent layers:
 *
 *   1. OAuth scope is gmail.readonly — Google itself refuses send/modify/delete
 *      with the token we hold.
 *   2. No email-mutating action exists in the catalog (actions.js) — the agent
 *      can only propose what is registered (deny-by-default); v1 adds none.
 *   3. This module exposes NO send/reply/delete/archive/modify function — only
 *      list + get (read).
 *   4. Email content never reaches a privileged path: it becomes deterministic
 *      structured observations + evidence. It is untrusted data, never
 *      instructions — an email that says "delete all evidence" produces a
 *      stored observation and nothing else.
 *
 * Tokens: the refresh token is stored ENCRYPTED (AES-256-GCM); access tokens are
 * never persisted. Data minimisation: metadata + snippet only unless
 * OPS_GMAIL_STORE_BODIES is explicitly enabled (full-body indexing is opt-in).
 *
 * Zero-dependency (raw fetch to Google endpoints, house style). Base URLs are
 * overridable (OPS_GMAIL_OAUTH_BASE / OPS_GMAIL_API_BASE) for hermetic tests.
 *
 * Config: OPS_GMAIL_CLIENT_ID · OPS_GMAIL_CLIENT_SECRET · OPS_GMAIL_REDIRECT_URI
 *   · OPS_GMAIL_TOKEN_SECRET · OPS_GMAIL_QUERY · OPS_GMAIL_MAX_MESSAGES
 *   · OPS_GMAIL_STORE_BODIES · OPS_GMAIL_POLL_MINUTES
 * ============================================================================ */
"use strict";
const crypto = require("node:crypto");
const rt = require("../runtime");
const store = rt.store;
const events = require("./events");

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const OAUTH_BASE = () => process.env.OPS_GMAIL_OAUTH_BASE || "https://oauth2.googleapis.com";
const API_BASE = () => process.env.OPS_GMAIL_API_BASE || "https://gmail.googleapis.com/gmail/v1";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TIMEOUT_MS = Number(process.env.OPS_GMAIL_TIMEOUT_MS || 10000);
const MAX_MESSAGES = () => { const n = Number(process.env.OPS_GMAIL_MAX_MESSAGES); return Number.isFinite(n) && n > 0 ? Math.min(200, n) : 50; };
const QUERY = () => process.env.OPS_GMAIL_QUERY || "in:inbox newer_than:7d -category:promotions -category:social";
const STORE_BODIES = () => /^(1|true|on|yes)$/i.test(String(process.env.OPS_GMAIL_STORE_BODIES || ""));

const clientId = () => process.env.OPS_GMAIL_CLIENT_ID || "";
const clientSecret = () => process.env.OPS_GMAIL_CLIENT_SECRET || "";
const redirectUri = () => process.env.OPS_GMAIL_REDIRECT_URI || `${(process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "")}/api/ops/gmail/callback`;
/** Configured = OAuth app credentials present (not necessarily connected). */
const configured = () => !!(clientId() && clientSecret());

// Free-mail domains never used for domain-based org matching (would fan every
// personal sender into one customer).
const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "yahoo.co.uk", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "pm.me"]);

// ── Token encryption at rest (AES-256-GCM) ──────────────────────────────────
function encKey() {
  const material = process.env.OPS_GMAIL_TOKEN_SECRET || process.env.RUNTIME_SESSION_SECRET || process.env.RUNTIME_ADMIN_KEY;
  if (!material) throw new Error("token encryption secret unavailable (set OPS_GMAIL_TOKEN_SECRET)");
  return crypto.createHash("sha256").update(String(material)).digest(); // 32 bytes
}
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ct: ct.toString("base64") };
}
function decrypt(enc) {
  if (!enc || !enc.iv || !enc.ct || !enc.tag) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", encKey(), Buffer.from(enc.iv, "base64"));
    decipher.setAuthTag(Buffer.from(enc.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(enc.ct, "base64")), decipher.final()]).toString("utf8");
  } catch { return null; }
}

// ── HTTP helper (fail-soft) ─────────────────────────────────────────────────
async function httpJson(url, { method = "GET", headers = {}, body = null } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method, headers, body, signal: ctrl.signal });
    let json = null; try { json = await res.json(); } catch { /* non-json */ }
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    return { ok: false, error: e.name === "AbortError" ? "timeout" : e.message };
  } finally { clearTimeout(t); }
}
const form = (obj) => new URLSearchParams(obj).toString();

// ── OAuth ───────────────────────────────────────────────────────────────────
/** The Google consent URL. Read-only scope, offline access, forced consent so a
 *  refresh token is always returned. `state` is the caller's CSRF token. */
function authUrl(state) {
  if (!configured()) throw new Error("Gmail OAuth not configured (OPS_GMAIL_CLIENT_ID / OPS_GMAIL_CLIENT_SECRET)");
  const q = form({
    client_id: clientId(), redirect_uri: redirectUri(), response_type: "code",
    scope: SCOPE, access_type: "offline", prompt: "consent", include_granted_scopes: "false",
    state: String(state || ""),
  });
  return `${AUTH_URL}?${q}`;
}

async function tokenRequest(params) {
  return httpJson(`${OAUTH_BASE()}/token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({ client_id: clientId(), client_secret: clientSecret(), ...params }),
  });
}

/** Exchange an authorization code for tokens, look up the mailbox address, and
 *  persist the refresh token ENCRYPTED. Returns { ok, mailbox_email }. */
async function exchangeCode(code, { connected_by = "operator" } = {}) {
  const res = await tokenRequest({ code, redirect_uri: redirectUri(), grant_type: "authorization_code" });
  if (!res.ok || !res.json || !res.json.refresh_token) {
    return { ok: false, error: `token exchange failed (${res.error || (res.json && res.json.error) || `HTTP ${res.status}`}) — ensure offline access + consent` };
  }
  const access = res.json.access_token;
  const prof = await httpJson(`${API_BASE()}/users/me/profile`, { headers: { authorization: `Bearer ${access}` } });
  const mailbox = (prof.json && prof.json.emailAddress) || "unknown";
  await saveToken({ mailbox_email: mailbox, refresh_token: res.json.refresh_token, scope: res.json.scope || SCOPE, connected_by });
  _access = { mailbox, token: access, exp: Date.now() + (Number(res.json.expires_in || 3600) - 60) * 1000 };
  return { ok: true, mailbox_email: mailbox };
}

// Access-token cache (in-memory only; never persisted).
let _access = null;
async function accessToken() {
  if (_access && _access.exp > Date.now()) return _access.token;
  const row = await tokenRow();
  if (!row || row.status !== "active") return null;
  const refresh = decrypt(row.refresh_token_enc);
  if (!refresh) return null;
  const res = await tokenRequest({ refresh_token: refresh, grant_type: "refresh_token" });
  if (!res.ok || !res.json || !res.json.access_token) return null;
  _access = { mailbox: row.mailbox_email, token: res.json.access_token, exp: Date.now() + (Number(res.json.expires_in || 3600) - 60) * 1000 };
  return _access.token;
}

// ── Token store ─────────────────────────────────────────────────────────────
async function tokenRow() { return store.findOne("ops_gmail_tokens", { status: "active" }).catch(() => null); }
async function saveToken({ mailbox_email, refresh_token, scope, connected_by }) {
  const existing = await tokenRow();
  const enc = encrypt(refresh_token);
  if (existing) return store.update("ops_gmail_tokens", existing.id, { mailbox_email, refresh_token_enc: enc, scope, connected_by, status: "active", updated_at: store.nowISO() });
  return store.insert("ops_gmail_tokens", { mailbox_email, refresh_token_enc: enc, scope, connected_by, status: "active", last_history_id: null, last_poll_at: null, updated_at: store.nowISO() });
}
/** Operator disconnect: revoke at Google (best-effort) + drop the stored token. */
async function disconnect() {
  const row = await tokenRow();
  if (!row) return { ok: true, disconnected: false };
  const refresh = decrypt(row.refresh_token_enc);
  if (refresh) await httpJson(`${OAUTH_BASE()}/revoke`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ token: refresh }) }).catch(() => {});
  await store.update("ops_gmail_tokens", row.id, { status: "revoked", refresh_token_enc: null, updated_at: store.nowISO() });
  _access = null;
  return { ok: true, disconnected: true };
}
const connected = async () => { const r = await tokenRow(); return !!(r && r.status === "active"); };

// ── Read-only Gmail API (list + get ONLY) ───────────────────────────────────
async function apiGet(pathAndQuery) {
  const token = await accessToken();
  if (!token) return { ok: false, error: "not connected" };
  return httpJson(`${API_BASE()}${pathAndQuery}`, { headers: { authorization: `Bearer ${token}` } });
}
function header(payload, name) {
  const h = (payload && payload.headers || []).find((x) => String(x.name).toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}
function parseAddress(v) {
  const m = String(v || "").match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  const e = String(v || "").trim().toLowerCase();
  return { name: "", email: /@/.test(e) ? e : "" };
}

// ── Deterministic sender → customer/contact matching ────────────────────────
async function contactIndex() {
  const orgs = await store.find("orgs", {}).catch(() => []);
  const byEmail = new Map();   // exact contact email → { org_id, contact_id }
  const byDomain = new Map();  // company domain → org_id (first wins; non-freemail)
  for (const org of orgs) {
    const eng = await rt.engagement.get(org.id).catch(() => null);
    for (const c of (eng && eng.contacts) || []) {
      const email = String(c.email || "").toLowerCase();
      if (!email || !/@/.test(email)) continue;
      byEmail.set(email, { org_id: org.id, contact_id: c.id, org_name: org.name });
      const domain = email.split("@")[1];
      if (domain && !FREE_MAIL.has(domain) && !byDomain.has(domain)) byDomain.set(domain, { org_id: org.id, org_name: org.name });
    }
  }
  return { byEmail, byDomain };
}
function matchSender(from_email, idx) {
  const email = String(from_email || "").toLowerCase();
  if (idx.byEmail.has(email)) { const m = idx.byEmail.get(email); return { org_id: m.org_id, contact_id: m.contact_id, method: "contact_email", confidence: "high" }; }
  const domain = email.split("@")[1];
  if (domain && !FREE_MAIL.has(domain) && idx.byDomain.has(domain)) { const m = idx.byDomain.get(domain); return { org_id: m.org_id, contact_id: null, method: "domain", confidence: "medium" }; }
  return { org_id: null, contact_id: null, method: "unmatched", confidence: "none" };
}

// ── Poll: read new inbound mail → matched, deduped evidence rows ─────────────
async function poll({ actor = "operations_agent" } = {}) {
  if (!(await connected())) return { ok: false, reason: "not_connected", fetched: 0, new: 0 };
  const list = await apiGet(`/users/me/messages?maxResults=${MAX_MESSAGES()}&q=${encodeURIComponent(QUERY())}`);
  if (!list.ok || !list.json) return { ok: false, reason: list.error || `HTTP ${list.status}`, fetched: 0, new: 0 };
  const ids = (list.json.messages || []).map((m) => m.id);
  const idx = await contactIndex();
  let created = 0, matched = 0, prospects = 0;
  const fmt = STORE_BODIES() ? "full" : "metadata";
  const metaHeaders = "metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date";
  for (const id of ids) {
    if (await store.findOne("ops_email_events", { gmail_message_id: id }).catch(() => null)) continue; // idempotent dedupe
    const msg = await apiGet(`/users/me/messages/${id}?format=${fmt}&${metaHeaders}`);
    if (!msg.ok || !msg.json) continue;
    const p = msg.json.payload || {};
    const from = parseAddress(header(p, "From"));
    const to = String(header(p, "To") || "").split(",").map((s) => parseAddress(s).email).filter(Boolean);
    const m = matchSender(from.email, idx);
    const observation_kind = m.org_id ? "email.customer_inbound" : "email.prospect_inbound";
    const row = await store.insert("ops_email_events", {
      gmail_message_id: id, gmail_thread_id: msg.json.threadId || null,
      mailbox_email: _access ? _access.mailbox : (await tokenRow() || {}).mailbox_email || null,
      direction: "inbound", from_email: from.email, from_name: from.name,
      to_emails: to, subject: String(header(p, "Subject") || "").slice(0, 500),
      snippet: String(msg.json.snippet || "").slice(0, 1000),
      received_at: msg.json.internalDate ? new Date(Number(msg.json.internalDate)).toISOString() : null,
      labels: msg.json.labelIds || [],
      org_id: m.org_id, contact_id: m.contact_id, match_method: m.method, match_confidence: m.confidence,
      has_body: STORE_BODIES(), observation_kind,
    });
    created += 1; if (m.org_id) matched += 1; else prospects += 1;
    await events.emit("email.received", { email_event_id: row.id, gmail_message_id: id, from_email: from.email, org_id: m.org_id, subject: row.subject }, { org_id: m.org_id });
  }
  const row = await tokenRow();
  if (row) await store.update("ops_gmail_tokens", row.id, { last_poll_at: store.nowISO(), last_history_id: list.json.historyId || row.last_history_id || null });
  return { ok: true, fetched: ids.length, new: created, matched, prospects, actor };
}

// ── Read model (operator surfaces) ──────────────────────────────────────────
function shape(e) {
  if (!e) return null;
  return { id: e.id, gmail_message_id: e.gmail_message_id, gmail_thread_id: e.gmail_thread_id,
    from_email: e.from_email, from_name: e.from_name, subject: e.subject, snippet: e.snippet,
    received_at: e.received_at, labels: e.labels || [], org_id: e.org_id || null, contact_id: e.contact_id || null,
    match_method: e.match_method, match_confidence: e.match_confidence, observation_kind: e.observation_kind,
    thread_url: e.gmail_thread_id ? `https://mail.google.com/mail/u/0/#inbox/${e.gmail_thread_id}` : null };
  // NB: refresh/access tokens are never part of any shaped record.
}
async function recentEvents({ org_id, since, limit = 100 } = {}) {
  let rows = await store.find("ops_email_events", org_id ? { org_id } : {}).catch(() => []);
  if (since) rows = rows.filter((r) => String(r.received_at || r.created_at) >= since);
  rows.sort((a, b) => String(b.received_at || b.created_at).localeCompare(String(a.received_at || a.created_at)));
  return rows.slice(0, Math.max(1, Math.min(500, limit))).map(shape);
}

/** Connection status for the systems board — NEVER includes any token. */
async function status() {
  const row = await tokenRow();
  return {
    configured: configured(), connected: !!(row && row.status === "active"),
    mailbox: row ? row.mailbox_email : null, scope: row ? row.scope : SCOPE,
    read_only: true, store_bodies: STORE_BODIES(),
    last_poll_at: row ? row.last_poll_at : null,
    query: QUERY(),
    required_env: configured() ? [] : ["OPS_GMAIL_CLIENT_ID", "OPS_GMAIL_CLIENT_SECRET"],
  };
}

/** Compact briefing summary: inbound customer + prospect counts, awaiting-reply.
 *  Awaiting-reply = a customer inbound email newer than that org's most recent
 *  engagement note (a proxy for "we haven't responded"). Deterministic. */
async function summary({ days = 7 } = {}) {
  const st = await status();
  if (!st.connected) return { available: false, reason: st.configured ? "Gmail configured but not connected" : "Gmail integration not configured", configured: st.configured };
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = await recentEvents({ since, limit: 500 });
  const customer = rows.filter((r) => r.org_id);
  const prospects = rows.filter((r) => !r.org_id);
  const awaiting = [];
  const seen = new Set();
  for (const e of customer) {
    if (seen.has(e.org_id)) continue; seen.add(e.org_id);
    const eng = await rt.engagement.get(e.org_id).catch(() => null);
    const lastNote = eng && (eng.notes || [])[0] ? String(eng.notes[0].at) : null;
    if (!lastNote || String(e.received_at) > lastNote) awaiting.push({ org_id: e.org_id, from_email: e.from_email, subject: e.subject, received_at: e.received_at, thread_url: e.thread_url });
  }
  return { available: true, mailbox: st.mailbox, window_days: days,
    inbound_customer: customer.length, inbound_prospect: prospects.length,
    awaiting_reply: awaiting, source_ids: rows.map((r) => r.gmail_message_id), last_poll_at: st.last_poll_at };
}

module.exports = {
  SCOPE, configured, connected, authUrl, exchangeCode, disconnect, status,
  poll, recentEvents, summary, matchSender, contactIndex,
  // exported for tests
  _encrypt: encrypt, _decrypt: decrypt,
};
