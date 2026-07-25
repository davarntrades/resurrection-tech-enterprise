/* ============================================================================
 * Guardian OS Sovereign — immutable runtime.
 *
 * In sovereign and air-gapped production the governed configuration is LOCKED:
 * policies, packs and runtime configuration change only through a bundle whose
 * signature has been verified. Ad-hoc authoring from the Control Room, from an
 * API route, or from an agent, is refused.
 *
 * The lock is not a boolean a caller can pass. `assertMutable()` fails unless
 * execution is inside `withVerifiedBundle()`, and the ONLY callers of that are
 * the install paths that have already verified a signature. A route handler
 * cannot claim to be an update; it has to actually be one.
 *
 * ROLLBACK IS DELIBERATELY NOT LOCKED. Immutability exists to stop silent drift
 * and unsigned additions — it must never take away an operator's ability to
 * STOP enforcement. A sovereign estate where a mis-scoped policy is blocking
 * clinical or emergency work, and nobody can disable it without a signing
 * ceremony, is a worse failure than the drift immutability prevents. Every
 * rollback is recorded in the admin audit trail and surfaced by
 * `guardian verify`, so the brake is loud rather than locked.
 * (Documented under "Security assumptions" in docs/SOVEREIGN.md.)
 * ========================================================================== */
"use strict";
const profiles = require("./profiles");

class ImmutableRuntimeError extends Error {
  constructor(what) {
    super(`immutable runtime: ${what} is locked under the ${profiles.profileSafe().id} profile — install a signed update bundle (guardian update <file>.gos) instead`);
    this.name = "ImmutableRuntimeError";
    this.code = "IMMUTABLE_RUNTIME";
  }
}

// Depth-counted so nested install steps (a pack installing several policies)
// stay inside one window, and an exception can never leave it open.
let _depth = 0;

/** Run `fn` as a verified-bundle installation. Callers MUST have verified a
 *  bundle signature first — this is the window immutability opens for. */
async function withVerifiedBundle(fn) {
  _depth += 1;
  try { return await fn(); }
  finally { _depth -= 1; }
}

const inVerifiedBundle = () => _depth > 0;

/** True when this deployment's governed configuration is locked. */
const locked = () => profiles.immutable() && !inVerifiedBundle();

/** Throw unless `what` may be changed right now. */
function assertMutable(what) {
  if (locked()) throw new ImmutableRuntimeError(what);
}

function status() {
  return {
    immutable: profiles.immutable(),
    profile: profiles.profileSafe().id,
    in_verified_bundle: inVerifiedBundle(),
    note: profiles.immutable()
      ? "policies, packs and runtime configuration change only through a verified signed bundle; rollback remains available as the emergency brake"
      : null,
  };
}

module.exports = { ImmutableRuntimeError, withVerifiedBundle, inVerifiedBundle, locked, assertMutable, status };
