import crypto from "node:crypto";

export const SESSION_COOKIE = "rg_frontier_reviewer";
export const SESSION_GRANTS_COOKIE = "rg_frontier_reviewer_grants";

const DEFAULT_TTL_SEC = 4 * 60 * 60;
const MAX_GRANTED_SESSIONS = 20;

type ReviewerPayload = {
  sub: string;
  role: "reviewer";
  iat: number;
  exp: number;
};

type SessionGrantPayload = {
  sub: string;
  scope: "frontier-session-grants";
  ids: string[];
  iat: number;
  exp: number;
};

function b64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  try { return crypto.timingSafeEqual(left, right); } catch { return false; }
}

function ttlSec() {
  const configured = Number(process.env.FRONTIER_REVIEWER_TTL_SEC);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_TTL_SEC;
}

function reviewerPassword() {
  return process.env.FRONTIER_REVIEWER_PASSWORD || "";
}

function signingSecret() {
  return process.env.FRONTIER_REVIEWER_SESSION_SECRET || "";
}

function reviewerIdentity() {
  const configured = String(process.env.FRONTIER_REVIEWER_IDENTITY || "external-reviewer").trim();
  return configured.slice(0, 120) || "external-reviewer";
}

function configuredExpiryEpoch() {
  const raw = String(process.env.FRONTIER_REVIEWER_EXPIRES_AT || "").trim();
  if (!raw) return null;
  const epoch = Math.floor(Date.parse(raw) / 1000);
  return Number.isFinite(epoch) ? epoch : null;
}

function accessWindowOpen(now = Math.floor(Date.now() / 1000)) {
  const configuredExpiry = configuredExpiryEpoch();
  return configuredExpiry == null || now < configuredExpiry;
}

export function configured() {
  return Boolean(reviewerPassword() && signingSecret()) && accessWindowOpen();
}

function sign(payloadB64: string) {
  const secret = signingSecret();
  if (!secret) return "";
  return b64url(crypto.createHmac("sha256", secret).update(payloadB64).digest());
}

function encodeSigned(payload: ReviewerPayload | SessionGrantPayload) {
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

function decodeSigned<T>(token: string | undefined | null): T | null {
  if (!token || !signingSecret() || !accessWindowOpen()) return null;
  const [payloadB64, signature, ...rest] = String(token).split(".");
  if (!payloadB64 || !signature || rest.length || !safeEqual(signature, sign(payloadB64))) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as T & { exp?: number };
    if (!payload || typeof payload.exp !== "number" || Math.floor(Date.now() / 1000) >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function login(password: string) {
  if (!configured()) return { ok: false as const, error: "reviewer login not configured or expired" };
  if (!password || !safeEqual(password, reviewerPassword())) return { ok: false as const, error: "invalid credentials" };

  const now = Math.floor(Date.now() / 1000);
  const configuredExpiry = configuredExpiryEpoch();
  const exp = Math.min(now + ttlSec(), configuredExpiry ?? Number.MAX_SAFE_INTEGER);
  const payload: ReviewerPayload = { sub: reviewerIdentity(), role: "reviewer", iat: now, exp };
  return { ok: true as const, token: encodeSigned(payload), exp, maxAgeSec: Math.max(1, exp - now), identity: payload.sub };
}

export function verifyToken(token: string | undefined | null) {
  const payload = decodeSigned<ReviewerPayload>(token);
  if (!payload || payload.role !== "reviewer" || !payload.sub) return null;
  return payload;
}

export function issueSessionGrant(existingToken: string | undefined | null, sessionId: string) {
  const reviewer = reviewerIdentity();
  const existing = readSessionGrants(existingToken);
  const ids = [sessionId, ...existing.filter((id) => id !== sessionId)].slice(0, MAX_GRANTED_SESSIONS);
  const now = Math.floor(Date.now() / 1000);
  const configuredExpiry = configuredExpiryEpoch();
  const exp = Math.min(now + ttlSec(), configuredExpiry ?? Number.MAX_SAFE_INTEGER);
  const payload: SessionGrantPayload = { sub: reviewer, scope: "frontier-session-grants", ids, iat: now, exp };
  return { token: encodeSigned(payload), exp, maxAgeSec: Math.max(1, exp - now), ids };
}

export function readSessionGrants(token: string | undefined | null) {
  const payload = decodeSigned<SessionGrantPayload>(token);
  if (!payload || payload.scope !== "frontier-session-grants" || payload.sub !== reviewerIdentity() || !Array.isArray(payload.ids)) return [];
  return payload.ids.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, MAX_GRANTED_SESSIONS);
}

export function canAccessSession(token: string | undefined | null, sessionId: string) {
  return readSessionGrants(token).includes(sessionId);
}
