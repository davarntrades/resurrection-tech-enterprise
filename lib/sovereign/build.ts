/* ============================================================================
 * Guardian OS Sovereign — build-time deployment switches for the web tier.
 *
 * A sovereign build must not merely *fail* to reach the internet; it must not
 * ASK. A browser on a disconnected network that requests fonts.googleapis.com
 * does not error usefully — it stalls, then falls back, and the operator sees a
 * slow, subtly wrong interface with no explanation. So the requests are removed
 * from the output at build time rather than blocked at runtime.
 *
 * What a sovereign build drops:
 *   • Google Fonts (preconnect + stylesheet) → a system font stack, inlined
 *   • Vercel Analytics + Speed Insights      → not rendered at all
 *   • GA4 / Plausible                        → not rendered at all
 *   • Calendly embeds                        → replaced with a plain contact note
 *
 * These are resolved at BUILD time, not request time, so the emitted HTML and
 * JS chunks contain no reference to an external host. scripts/sovereign/
 * offline-audit.cjs proves that by scanning the build output and the rendered
 * pages, and fails the build if any host reappears.
 *
 * TypeScript (not .js) because the App Router components import it directly.
 * Kept dependency-free and side-effect-free so it is safe in any component.
 * ========================================================================== */

/** Deployment profiles whose UI must make no external request. */
const OFFLINE_PROFILES = new Set(["on_prem", "sovereign", "air_gapped"]);

function normalise(v: string | undefined): string {
  return String(v || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * Is this an offline-clean build?
 *
 * `SOVEREIGN_BUILD=1` forces it on (so a cloud-profile CI job can build and
 * audit the sovereign output). Otherwise it follows GUARDIAN_PROFILE. Both are
 * read through NEXT_PUBLIC_ aliases as well, because client components need the
 * same answer and Next.js only inlines NEXT_PUBLIC_ variables into the browser
 * bundle.
 */
export function isSovereignBuild(): boolean {
  const forced = normalise(process.env.SOVEREIGN_BUILD || process.env.NEXT_PUBLIC_SOVEREIGN_BUILD);
  if (forced === "1" || forced === "true" || forced === "yes" || forced === "on") return true;
  if (forced === "0" || forced === "false" || forced === "no" || forced === "off") return false;
  const profile = normalise(process.env.GUARDIAN_PROFILE || process.env.NEXT_PUBLIC_GUARDIAN_PROFILE);
  return OFFLINE_PROFILES.has(profile);
}

/** The profile this build targets (for the footer / status banner). */
export function buildProfile(): string {
  return normalise(process.env.GUARDIAN_PROFILE || process.env.NEXT_PUBLIC_GUARDIAN_PROFILE) || (isSovereignBuild() ? "sovereign" : "cloud");
}

/**
 * The font stack a sovereign build uses instead of Geist. Every family here is
 * shipped with the operating system, so nothing is fetched and nothing renders
 * in a fallback face after a timeout. Emitted as an inline <style> that
 * overrides the design system's --font / --mono variables.
 */
export const SYSTEM_FONT_CSS = `:root{--font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif;--font-display:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,"Times New Roman",serif;--mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono","DejaVu Sans Mono",monospace}`;

/** Hosts a sovereign build is allowed to *mention* (never to fetch). */
export const ALLOWED_INERT_HOSTS = [
  // JSON-LD @context is an identifier, not a fetch: no request is ever made for
  // it by a browser. Kept so structured data stays valid on a private network.
  "https://schema.org",
];
