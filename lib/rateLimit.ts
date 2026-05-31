/**
 * Lightweight in-memory rate limiter (per IP, sliding window).
 *
 * Sufficient for a single-region serverless deployment with low write
 * volume. For multi-region / high-scale, swap this for Upstash Redis
 * (see docs/DEPLOYMENT.md → "Scaling the rate limiter").
 */
type Stamp = number;
const hits = new Map<string, Stamp[]>();

const MAX = Number(process.env.RATE_LIMIT_MAX ?? 5);
const WINDOW = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 10 * 60 * 1000);

export function rateLimit(ip: string): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW);
  if (arr.length >= MAX) {
    const retryAfterMs = WINDOW - (now - arr[0]);
    hits.set(ip, arr);
    return { ok: false, retryAfterMs };
  }
  arr.push(now);
  hits.set(ip, arr);
  return { ok: true, retryAfterMs: 0 };
}

/** Best-effort client IP from common proxy headers (Vercel sets these). */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
