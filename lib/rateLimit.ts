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

export interface RateLimitOptions {
  /** Max requests per window for this bucket. Defaults to RATE_LIMIT_MAX (5). */
  max?: number;
  /** Window length in ms. Defaults to RATE_LIMIT_WINDOW_MS (10 min). */
  windowMs?: number;
  /** Namespace so independent endpoints don't share a counter. */
  bucket?: string;
}

export function rateLimit(ip: string, opts: RateLimitOptions = {}): { ok: boolean; retryAfterMs: number } {
  const max = opts.max ?? MAX;
  const window = opts.windowMs ?? WINDOW;
  const key = opts.bucket ? `${opts.bucket}:${ip}` : ip;
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < window);
  if (arr.length >= max) {
    const retryAfterMs = window - (now - arr[0]);
    hits.set(key, arr);
    return { ok: false, retryAfterMs };
  }
  arr.push(now);
  hits.set(key, arr);
  return { ok: true, retryAfterMs: 0 };
}

/** Best-effort client IP from common proxy headers (Vercel sets these). */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
