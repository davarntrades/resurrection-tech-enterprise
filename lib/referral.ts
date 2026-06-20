/**
 * Referral attribution utilities — shared by the /referral generator and the
 * /assessment capture. Pure, dependency-free.
 *
 * Designed to grow into a partner portal later (referrer → leads → workshops →
 * audits → pilots → integrations → commission status) without changing the
 * link format: a referral is identified by its slug `code`.
 */

export const REF_MAX_LENGTH = 64;
export const DIRECT_SOURCE = "Direct / Unknown";

/**
 * Turn a name or chosen code into a safe URL slug.
 *   "Gabriel Smith"     → "gabriel-smith"
 *   "Raj"               → "raj"
 *   "AI Safety Event"   → "ai-safety-event"
 * Lowercase, ASCII-only, unsafe chars collapsed to single hyphens, trimmed,
 * length-capped. Returns "" for empty/invalid input.
 */
export function slugifyRef(input: string): string {
  return (input ?? "")
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")     // any unsafe run → single hyphen
    .replace(/^-+|-+$/g, "")          // trim leading/trailing hyphens
    .slice(0, REF_MAX_LENGTH)
    .replace(/-+$/g, "");             // re-trim if the slice cut mid-hyphen
}

/** Human-friendly source label from a code. "gabriel-smith" → "Gabriel Smith". */
export function humanizeRef(code: string): string {
  if (!code) return DIRECT_SOURCE;
  return code
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Relative assessment link for a code, e.g. "/assessment?ref=gabriel". */
export function referralPath(code: string): string {
  return code ? `/assessment?ref=${code}` : "/assessment";
}

/** Absolute referral link given a site origin. */
export function referralUrl(code: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}${referralPath(code)}`;
}
