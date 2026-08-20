/* ============================================================================
 * Guardian OS Sovereign — deployment profiles.
 *
 * ONE platform, interchangeable deployment providers. A profile does not change
 * WHAT Guardian OS does; it changes WHERE its state lives and WHAT it is allowed
 * to talk to. The Runtime Governance kernel is byte-for-byte identical in every
 * profile — deny-by-default, fail-closed, DENY-ONLY dynamic policies. Only the
 * providers behind the same interfaces are swapped.
 *
 * FAIL-CLOSED SELECTION — an unknown profile name is a hard error, never a
 * silent fallback to cloud.
 * ========================================================================== */
"use strict";

const STORAGE = { CLOUD: "cloud", LOCAL: "local" };
const POLICY = { REMOTE: "remote", BUNDLE: "bundle" };
const EGRESS = { ALLOWED: "allowed", RESTRICTED: "restricted", DENIED: "denied" };
const UPDATES = { CONTINUOUS: "continuous", BUNDLE: "bundle", SIGNED_BUNDLE: "signed_bundle" };

const PROFILES = {
  cloud: {
    id: "cloud", title: "Cloud",
    summary: "Resurrection Tech-operated SaaS. Managed control plane, continuous updates.",
    storage: STORAGE.CLOUD, evidence: STORAGE.CLOUD, policy_provider: POLICY.REMOTE,
    monitoring: "cloud", telemetry: true, updates: UPDATES.CONTINUOUS,
    egress: EGRESS.ALLOWED, immutable_default: false, require_signed_bundles: false,
  },
  hybrid: {
    id: "hybrid", title: "Hybrid",
    summary: "Cloud control plane with evidence retained on customer infrastructure.",
    storage: STORAGE.CLOUD, evidence: STORAGE.LOCAL, policy_provider: POLICY.REMOTE,
    monitoring: "cloud", telemetry: false, updates: UPDATES.CONTINUOUS,
    egress: EGRESS.ALLOWED, immutable_default: false, require_signed_bundles: false,
  },
  private_cloud: {
    id: "private_cloud", title: "Private cloud",
    summary: "Customer's own cloud tenancy. No vendor telemetry, customer-held keys.",
    storage: STORAGE.CLOUD, evidence: STORAGE.CLOUD, policy_provider: POLICY.REMOTE,
    monitoring: "local", telemetry: false, updates: UPDATES.BUNDLE,
    egress: EGRESS.RESTRICTED, immutable_default: false, require_signed_bundles: false,
  },
  sovereign_private: {
    id: "sovereign_private", title: "Sovereign private",
    summary: "Customer-owned durable data plane with bundled policy, local monitoring, signed updates and approved-endpoint-only egress.",
    // `cloud` means the existing durable Supabase/Postgres adapter; in this
    // profile that endpoint must be CUSTOMER-OWNED. The readiness engine refuses
    // activation unless GUARDIAN_CUSTOMER_DATA_PLANE=1 attests that boundary.
    storage: STORAGE.CLOUD, evidence: STORAGE.CLOUD, policy_provider: POLICY.BUNDLE,
    monitoring: "local", telemetry: false, updates: UPDATES.SIGNED_BUNDLE,
    egress: EGRESS.RESTRICTED, immutable_default: true, require_signed_bundles: true,
  },
  on_prem: {
    id: "on_prem", title: "On-premises",
    summary: "Customer datacentre. Local state, bundled policies, egress optional.",
    storage: STORAGE.LOCAL, evidence: STORAGE.LOCAL, policy_provider: POLICY.BUNDLE,
    monitoring: "local", telemetry: false, updates: UPDATES.BUNDLE,
    egress: EGRESS.RESTRICTED, immutable_default: false, require_signed_bundles: false,
  },
  sovereign: {
    id: "sovereign", title: "Sovereign",
    summary: "National / regulated deployment. Signed bundles only, egress denied, immutable runtime.",
    storage: STORAGE.LOCAL, evidence: STORAGE.LOCAL, policy_provider: POLICY.BUNDLE,
    monitoring: "local", telemetry: false, updates: UPDATES.SIGNED_BUNDLE,
    egress: EGRESS.DENIED, immutable_default: true, require_signed_bundles: true,
  },
  air_gapped: {
    id: "air_gapped", title: "Air-gapped",
    summary: "No network. Cloud clients are refused even when credentials are present.",
    storage: STORAGE.LOCAL, evidence: STORAGE.LOCAL, policy_provider: POLICY.BUNDLE,
    monitoring: "local", telemetry: false, updates: UPDATES.SIGNED_BUNDLE,
    egress: EGRESS.DENIED, immutable_default: true, require_signed_bundles: true,
  },
};

const PROFILE_IDS = Object.keys(PROFILES);
const DEFAULT_PROFILE = "cloud";
class ProfileError extends Error {}
function normalise(name) { return String(name || "").trim().toLowerCase().replace(/[\s-]+/g, "_"); }
function profile(name) {
  const raw = name !== undefined && name !== null && name !== "" ? name : (process.env.GUARDIAN_PROFILE || DEFAULT_PROFILE);
  const key = normalise(raw);
  const p = PROFILES[key];
  if (!p) throw new ProfileError(`unknown deployment profile ${JSON.stringify(String(raw))} — expected one of ${PROFILE_IDS.join(", ")}`);
  return p;
}
function profileSafe(name) { try { return profile(name); } catch { return PROFILES[DEFAULT_PROFILE]; } }
const allowsEgress = (p) => profile(p).egress !== EGRESS.DENIED;
const allowsCloudStore = (p) => profile(p).storage === STORAGE.CLOUD;
const allowsCloudEvidence = (p) => profile(p).evidence === STORAGE.CLOUD;
const usesPolicyBundle = (p) => profile(p).policy_provider === POLICY.BUNDLE;
const requiresSignedBundles = (p) => profile(p).require_signed_bundles === true;
const allowsTelemetry = (p) => profile(p).telemetry === true;
function immutable(p) {
  const prof = profile(p);
  const raw = String(process.env.GUARDIAN_IMMUTABLE || "").trim().toLowerCase();
  if (prof.immutable_default) return true;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
function describe(p) {
  const prof = profile(p);
  return {
    profile: prof.id, title: prof.title, summary: prof.summary,
    storage: prof.storage, evidence: prof.evidence,
    policy_provider: prof.policy_provider, monitoring: prof.monitoring,
    telemetry: prof.telemetry, updates: prof.updates, egress: prof.egress,
    immutable: immutable(prof.id), require_signed_bundles: prof.require_signed_bundles,
  };
}
const list = () => PROFILE_IDS.map((id) => describe(id));

module.exports = {
  STORAGE, POLICY, EGRESS, UPDATES,
  PROFILES, PROFILE_IDS, DEFAULT_PROFILE, ProfileError,
  normalise, profile, profileSafe, describe, list,
  allowsEgress, allowsCloudStore, allowsCloudEvidence, usesPolicyBundle,
  requiresSignedBundles, allowsTelemetry, immutable,
};
