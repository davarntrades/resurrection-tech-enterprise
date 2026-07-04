/* ============================================================================
 * Runtime Governance — per-key rate limiting (L5).
 *
 * A sliding-window limiter keyed by API key. In-process (single-node) — correct
 * for the standalone gateway and adequate for a pilot; a multi-node deployment
 * should back this with a shared store (Redis / a Supabase table). Disabled
 * unless RUNTIME_RATE_LIMIT is set, so it never affects existing behaviour or
 * tests by default.
 *
 *   RUNTIME_RATE_LIMIT   max requests per window per key (0/unset = disabled)
 *   RUNTIME_RATE_WINDOW_MS  window in ms (default 60000)
 * ============================================================================ */
"use strict";

const LIMIT = Number(process.env.RUNTIME_RATE_LIMIT || 0);
const WINDOW = Number(process.env.RUNTIME_RATE_WINDOW_MS || 60000);
const buckets = new Map();          // key_id → number[] (timestamps in window)

const enabled = () => LIMIT > 0;

// Returns { allowed, remaining, retry_after_ms }. Allows everything when disabled.
function check(keyId, opts = {}) {
  const limit = opts.limit || LIMIT;
  const window = opts.window || WINDOW;
  if (!(limit > 0)) return { allowed: true, remaining: Infinity, retry_after_ms: 0 };
  const id = keyId || "anon";
  const now = Date.now();
  const cutoff = now - window;
  let hits = buckets.get(id);
  if (!hits) { hits = []; buckets.set(id, hits); }
  // drop timestamps older than the window
  while (hits.length && hits[0] <= cutoff) hits.shift();
  if (hits.length >= limit) {
    return { allowed: false, remaining: 0, retry_after_ms: Math.max(0, hits[0] + window - now) };
  }
  hits.push(now);
  return { allowed: true, remaining: limit - hits.length, retry_after_ms: 0 };
}

function _reset() { buckets.clear(); }

module.exports = { enabled, check, _reset, LIMIT, WINDOW };
