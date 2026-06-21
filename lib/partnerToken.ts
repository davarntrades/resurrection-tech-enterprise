/**
 * Partner-link access tokens (Phase 3 visibility layer).
 *
 * A partner page lives at /partner/<code>?t=<token>. The token is an HMAC of the
 * code with a server-only secret, so codes cannot be guessed or enumerated to
 * read another partner's stats. Server-only (node:crypto) — never import into a
 * client component.
 *
 * NOTE: this is a visibility gate, not authentication. No accounts, no
 * commission, no payments (that is Phase 4).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  return process.env.PARTNER_LINK_SECRET || "";
}

/** Whether partner links can be signed/verified (secret configured). */
export function partnerLinksEnabled(): boolean {
  return secret().length > 0;
}

/** Deterministic token for a code, or null if no secret is configured. */
export function signCode(code: string): string | null {
  const s = secret();
  if (!s) return null;
  return createHmac("sha256", s).update(code).digest("hex").slice(0, 32);
}

/** Constant-time verification of a code+token pair. */
export function verifyToken(code: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const expected = signCode(code);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Relative partner link, or null if signing is unavailable. */
export function partnerPath(code: string): string | null {
  const t = signCode(code);
  return t ? `/partner/${encodeURIComponent(code)}?t=${t}` : null;
}

/** Absolute partner link given a site origin, or null if signing is unavailable. */
export function partnerUrl(code: string, origin: string): string | null {
  const p = partnerPath(code);
  return p ? `${origin.replace(/\/$/, "")}${p}` : null;
}
