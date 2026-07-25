/* ============================================================================
 * Guardian OS Sovereign — barrel export.
 *
 * ONE platform, interchangeable deployment providers. Nothing in here changes
 * WHAT Guardian OS governs or HOW the Runtime Governance kernel decides — it
 * changes only where state lives, where policies come from, and what the
 * deployment is permitted to talk to.
 *
 *   profiles   cloud · hybrid · private_cloud · on_prem · sovereign · air_gapped
 *   bundle     the signed `guardian.bundle/1` format (policies, packs, updates)
 *   packs      offline Industry Intelligence Pack export + declarative install
 *   updates    signed offline update packages, with a rollback plan
 *   immutable  the locked-runtime guard
 *   verify     `guardian verify` — diagnostic, never corrective
 *
 * Dependency-light on purpose: `profiles` and `bundle` require nothing at all,
 * so the CLI, a build step, or the store can use them without loading the
 * platform.
 * ========================================================================== */
"use strict";
const profiles = require("./profiles");
const bundle = require("./bundle");
const packs = require("./packs");
const updates = require("./updates");
const immutable = require("./immutable");
const verify = require("./verify");

/**
 * A one-shot description of this deployment, for /api health surfaces and the
 * Control Room banner. Cheap + synchronous: no store reads, no network.
 */
function status() {
  const d = profiles.describe();
  const trust = bundle.loadTrust();
  return {
    ...d,
    immutable: immutable.status(),
    policy_bundle: process.env.GUARDIAN_POLICY_BUNDLE || null,
    trust_store: { dir: trust.dir, keys: trust.count, hmac_configured: !!trust.hmac_key },
  };
}

module.exports = { profiles, bundle, packs, updates, immutable, verify, status };
