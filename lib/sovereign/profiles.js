/* ============================================================================
 * Guardian OS Sovereign — deployment profiles.
 *
 * ONE platform, interchangeable deployment providers. A profile does not change
 * WHAT Guardian OS does; it changes WHERE its state lives and WHAT it is allowed
 * to talk to. The Runtime Governance kernel is byte-for-byte identical in every
 * profile — deny-by-default, fail-closed, DENY-ONLY dynamic policies. Only the
 * providers behind the same interfaces are swapped.
 *
 *   cloud          Resurrection Tech-operated SaaS (today's production).
 *   hybrid         Cloud control plane, evidence retained on customer infra.
 *   private_cloud  Customer's own cloud tenancy; no vendor telemetry.
 *   on_prem        Customer datacentre; local state, bundled policies, egress
 *                  permitted but never required.
 *   sovereign      National/regulated deployment: local state, SIGNED policy
 *                  bundles only, egress denied, immutable runtime by default.
 *   air_gapped     No network at all. Everything above, plus: the platform
 *                  refuses to construct a cloud client even if credentials are
 *                  present in the environment.
 *
 * FAIL-CLOSED SELECTION — an unknown profile name is a hard error, not a
 * silent fallback to `cloud`. A sovereign operator misspelling their profile
 * must get a refusal, never an accidental internet-connected deployment.
 *
 * Dependency-free (no requires) so the profile can be resolved from anywhere:
 * the store, the CLI, the API routes, a build step, or a test harness.
 * ========================================================================== */
"use strict";

/** Where row + object state is persisted. */
const STORAGE = { CLOUD: "cloud", LOCAL: "local" };
/** Where the engine's dynamic Ω policies come from. */
const POLICY = { REMOTE: "remote", BUNDLE: "bundle" };
/** What the deployment is permitted to reach. */
const EGRESS = { ALLOWED: "allowed", RESTRICTED: "restricted", DENIED: "denied" };
/** How the deployment receives new policies, packs and code. */
const UPDATES = { CONTINUOUS: "continuous", BUNDLE: "bundle", SIGNED_BUNDLE: "signed_bundle" };

const PROFILES = {
  cloud: {
    id: "cloud",
    title: "Cloud",
    summary: "Resurrection Tech-operated SaaS. Managed control plane, continuous updates.",
    storage: STORAGE.CLOUD,
    evidence: STORAGE.CLOUD,
    policy_provider: POLICY.REMOTE,
    monitoring: "cloud",
    telemetry: true,
    updates: UPDATES.CONTINUOUS,
    egress: EGRESS.ALLOWED,
    immutable_default: false,
    require_signed_bundles: false,
  },
  hybrid: {
    id: "hybrid",
    title: "Hybrid",
    summary: "Cloud control plane with evidence retained on customer infrastructure.",
    storage: STORAGE.CLOUD,
    evidence: STORAGE.LOCAL,
    policy_provider: POLICY.REMOTE,
    monitoring: "cloud",
    telemetry: false,
    updates: UPDATES.CONTINUOUS,
    egress: EGRESS.ALLOWED,
    immutable_default: false,
    require_signed_bundles: false,
  },
  private_cloud: {
    id: "private_cloud",
    title: "Private cloud",
    summary: "Customer's own cloud tenancy. No vendor telemetry, customer-held keys.",
    storage: STORAGE.CLOUD,
    evidence: STORAGE.CLOUD,
    policy_provider: POLICY.REMOTE,
    monitoring: "local",
    telemetry: false,
    updates: UPDATES.BUNDLE,
    egress: EGRESS.RESTRICTED,
    immutable_default: false,
    require_signed_bundles: false,
  },
  on_prem: {
    id: "on_prem",
    title: "On-premises",
    summary: "Customer datacentre. Local state, bundled policies, egress optional.",
    storage: STORAGE.LOCAL,
    evidence: STORAGE.LOCAL,
    policy_provider: POLICY.BUNDLE,
    monitoring: "local",
    telemetry: false,
    updates: UPDATES.BUNDLE,
    egress: EGRESS.RESTRICTED,
    immutable_default: false,
    require_signed_bundles: false,
  },
  sovereign: {
    id: "sovereign",
    title: "Sovereign",
    summary: "National / regulated deployment. Signed bundles only, egress denied, immutable runtime.",
    storage: STORAGE.LOCAL,
    evidence: STORAGE.LOCAL,
    policy_provider: POLICY.BUNDLE,
    monitoring: "local",
    telemetry: false,
    updates: UPDATES.SIGNED_BUNDLE,
    egress: EGRESS.DENIED,
    immutable_default: true,
    require_signed_bundles: true,
  },
  air_gapped: {
    id: "air_gapped",
    title: "Air-gapped",
    summary: "No network. Cloud clients are refused even when credentials are present.",
    storage: STORAGE.LOCAL,
    evidence: STORAGE.LOCAL,
    policy_provider: POLICY.BUNDLE,
    monitoring: "local",
    telemetry: false,
    updates: UPDATES.SIGNED_BUNDLE,
    egress: EGRESS.DENIED,
    immutable_default: true,
    require_signed_bundles: true,
  },
};

const PROFILE_IDS = Object.keys(PROFILES);
const DEFAULT_PROFILE = "cloud";

class ProfileError extends Error {}

/** Normalise a profile name: `Air-Gapped`, `air gapped`, `AIR_GAPPED` → `air_gapped`. */
function normalise(name) {
  return String(name || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * The active deployment profile. Read once per call (not memoised) so tests and
 * the CLI can switch profiles in-process. Unknown names throw — see FAIL-CLOSED
 * SELECTION above.
 */
function profile(name) {
  const raw = name !== undefined && name !== null && name !== ""
    ? name
    : (process.env.GUARDIAN_PROFILE || DEFAULT_PROFILE);
  const key = normalise(raw);
  const p = PROFILES[key];
  if (!p) throw new ProfileError(`unknown deployment profile ${JSON.stringify(String(raw))} — expected one of ${PROFILE_IDS.join(", ")}`);
  return p;
}

/** The active profile, or the default if GUARDIAN_PROFILE is unset/invalid.
 *  Used ONLY by diagnostics that must never throw (health, status banners). */
function profileSafe(name) {
  try { return profile(name); } catch { return PROFILES[DEFAULT_PROFILE]; }
}

// ── Capability predicates (the questions the platform actually asks) ─────────

/** May this deployment open outbound network connections at all? */
const allowsEgress = (p) => profile(p).egress !== EGRESS.DENIED;

/** May this deployment persist state in a vendor/managed cloud (Supabase)? */
const allowsCloudStore = (p) => profile(p).storage === STORAGE.CLOUD;

/** May evidence (reports, exports, packs) leave the local filesystem? */
const allowsCloudEvidence = (p) => profile(p).evidence === STORAGE.CLOUD;

/** Does the engine read Ω policies from a filesystem bundle instead of a DB? */
const usesPolicyBundle = (p) => profile(p).policy_provider === POLICY.BUNDLE;

/** Must every installable bundle carry a verified signature? */
const requiresSignedBundles = (p) => profile(p).require_signed_bundles === true;

/** Is product/usage telemetry permitted? */
const allowsTelemetry = (p) => profile(p).telemetry === true;

/**
 * Immutable runtime: policies, packs and runtime configuration are locked and
 * only signed update bundles are accepted. On by default for sovereign and
 * air-gapped; GUARDIAN_IMMUTABLE=1 forces it on anywhere; GUARDIAN_IMMUTABLE=0
 * can relax it ONLY where the profile does not mandate it (a sovereign operator
 * cannot accidentally unlock production with an environment variable).
 */
function immutable(p) {
  const prof = profile(p);
  const raw = String(process.env.GUARDIAN_IMMUTABLE || "").trim().toLowerCase();
  if (prof.immutable_default) return true;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/** A one-shot description of the active deployment, for health + `guardian verify`. */
function describe(p) {
  const prof = profile(p);
  return {
    profile: prof.id,
    title: prof.title,
    summary: prof.summary,
    storage: prof.storage,
    evidence: prof.evidence,
    policy_provider: prof.policy_provider,
    monitoring: prof.monitoring,
    telemetry: prof.telemetry,
    updates: prof.updates,
    egress: prof.egress,
    immutable: immutable(prof.id),
    require_signed_bundles: prof.require_signed_bundles,
  };
}

/** All profiles, for the CLI + docs (no functions — safe to serialise). */
const list = () => PROFILE_IDS.map((id) => describe(id));

module.exports = {
  STORAGE, POLICY, EGRESS, UPDATES,
  PROFILES, PROFILE_IDS, DEFAULT_PROFILE, ProfileError,
  normalise, profile, profileSafe, describe, list,
  allowsEgress, allowsCloudStore, allowsCloudEvidence, usesPolicyBundle,
  requiresSignedBundles, allowsTelemetry, immutable,
};
