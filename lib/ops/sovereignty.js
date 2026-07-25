/* ============================================================================
 * Guardian OS — Sovereignty admissibility (Phase 7).
 *
 * Deployment and domain expertise are SEPARATE CONCERNS:
 *
 *     Guardian OS
 *       ↓
 *     Runtime Governance Kernel        (never forked, never duplicated)
 *       ↓
 *     Deployment Profile               (cloud / hybrid / private / sovereign)
 *       ↓
 *     Installed Intelligence Packs     (what domain knowledge it contains)
 *       ↓
 *     Governed Enterprise
 *
 * A Sovereign Intelligence Pack is domain intelligence for organisations whose
 * mission, regulation or operating environment requires sovereign AI. It is NOT
 * a sovereign edition of an Industry Pack, and it is NOT a second platform: it
 * installs through the same governed lifecycle, onto the same kernel, projected
 * over the same Digital Twin.
 *
 * What this module adds — and it is the ONLY thing Phase 7 adds to the platform
 * itself — is the question a sovereign buyer must be able to ask and have
 * answered honestly:
 *
 *     "May THIS pack be installed on THIS deployment?"
 *
 * DERIVED, NOT DECLARED. A classification does not name the profiles it trusts;
 * it declares the GUARANTEES it requires (local state, local evidence, no
 * telemetry, signed bundles, denied egress, immutable runtime, no network). The
 * eligible profiles are then derived from lib/sovereign/profiles.js. Add a
 * profile tomorrow and admissibility recomputes with no edit here; weaken a
 * profile's guarantees and the packs that depended on them stop being eligible
 * — automatically, and loudly.
 *
 * FAIL-CLOSED. An unknown classification is a hard error, never a silent
 * downgrade to the most permissive tier. A pack that cannot be assessed cannot
 * be installed. A deployment that cannot prove a guarantee does not get the
 * benefit of the doubt.
 *
 * NO NEW ENFORCEMENT. Nothing here can permit an action the kernel would refuse.
 * Admissibility gates INSTALLATION — it is a supply-chain control, not a runtime
 * one. Once installed, a sovereign pack's Ω policies are ordinary deny-only
 * policies evaluated by the same unchanged engine.
 * ========================================================================== */
"use strict";
const profiles = require("../sovereign/profiles");

class SovereigntyError extends Error {}

// ── The guarantees a classification can require of a deployment ──────────────
// Each is a predicate over the profile description produced by profiles.describe().
// Adding a guarantee here is how a future classification tightens the bar.
const GUARANTEES = {
  no_telemetry: {
    label: "No vendor telemetry",
    detail: "the deployment reports no product or usage telemetry to the vendor",
    holds: (d) => d.telemetry === false,
  },
  local_state: {
    label: "State held in the estate",
    detail: "enterprise state is persisted on infrastructure the organisation controls",
    holds: (d) => d.storage === profiles.STORAGE.LOCAL,
  },
  local_evidence: {
    label: "Evidence held in the estate",
    detail: "evidence, reports and exports never leave the organisation's infrastructure",
    holds: (d) => d.evidence === profiles.STORAGE.LOCAL,
  },
  signed_bundles: {
    label: "Signed supply chain",
    detail: "policies, packs and updates are accepted only as verified signed bundles",
    holds: (d) => d.require_signed_bundles === true,
  },
  egress_denied: {
    label: "Egress denied",
    detail: "the deployment is not permitted to open outbound connections",
    holds: (d) => d.egress === profiles.EGRESS.DENIED,
  },
  immutable_runtime: {
    label: "Immutable runtime",
    detail: "policies, packs and runtime configuration are locked; only signed updates change them",
    holds: (d) => d.immutable === true,
  },
  no_network: {
    label: "No network",
    detail: "the platform refuses to construct a cloud client even when credentials are present",
    holds: (d) => d.profile === "air_gapped",
  },
};
const GUARANTEE_IDS = Object.keys(GUARANTEES);

// ── Classification tiers ────────────────────────────────────────────────────
// Deliberately jurisdiction-neutral. A tier is a HANDLING BAR expressed in
// deployment guarantees, not a national marking scheme: an organisation maps its
// own scheme (UK OFFICIAL/SECRET, US CUI/CONFIDENTIAL, NATO, EU RESTREINT, or a
// regulator's operational-resilience tier) onto these during assessment. Ranks
// are monotonic — a higher tier requires everything the tier below requires.
const CLASSIFICATIONS = [
  {
    id: "official",
    rank: 1,
    title: "Official",
    summary: "Routine government, public-sector and regulated national business. Sensitive, but not classified.",
    requires: ["no_telemetry"],
  },
  {
    id: "official_sensitive",
    rank: 2,
    title: "Official — Sensitive",
    summary: "Material whose loss would damage individuals, an operator or public confidence. Evidence stays in the estate.",
    requires: ["no_telemetry", "local_evidence"],
  },
  {
    id: "secret",
    rank: 3,
    title: "Secret",
    summary: "Material whose compromise would threaten life, major operations or national capability. Sovereign deployment only.",
    requires: ["no_telemetry", "local_state", "local_evidence", "signed_bundles", "egress_denied", "immutable_runtime"],
  },
  {
    id: "top_secret",
    rank: 4,
    title: "Top Secret",
    summary: "Material whose compromise would cause exceptionally grave damage. Air-gapped deployment only.",
    requires: ["no_telemetry", "local_state", "local_evidence", "signed_bundles", "egress_denied", "immutable_runtime", "no_network"],
  },
];
const BY_ID = Object.fromEntries(CLASSIFICATIONS.map((c) => [c.id, c]));
const CLASSIFICATION_IDS = CLASSIFICATIONS.map((c) => c.id);
const DEFAULT_CLASSIFICATION = "official_sensitive";

/** Normalise a classification name: `Top Secret`, `TOP-SECRET` → `top_secret`. */
const normalise = (name) => String(name || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

/**
 * A classification tier by id. Unknown names throw — see FAIL-CLOSED above. A
 * sovereign operator who mistypes a tier must get a refusal, never an
 * accidental installation at the most permissive bar.
 */
function classification(id) {
  const c = BY_ID[normalise(id)];
  if (!c) throw new SovereigntyError(`unknown classification ${JSON.stringify(String(id))} — expected one of ${CLASSIFICATION_IDS.join(", ")}`);
  return c;
}

/** Every profile id that satisfies a classification's guarantees. DERIVED. */
function eligibleProfiles(id) {
  const c = classification(id);
  return profiles.PROFILE_IDS.filter((p) => {
    const d = profiles.describe(p);
    return c.requires.every((g) => GUARANTEES[g].holds(d));
  });
}

/** Every classification tier this deployment profile is able to host. DERIVED. */
function admissibleClassifications(profileId) {
  const d = profiles.describe(profileId);
  return CLASSIFICATIONS.filter((c) => c.requires.every((g) => GUARANTEES[g].holds(d))).map((c) => c.id);
}

// ── Assessment ──────────────────────────────────────────────────────────────

/**
 * Assess ONE classification against ONE deployment, guarantee by guarantee.
 * Always returns the full picture — the guarantees that hold AND the ones that
 * do not, each with the reason — so an operator is told why a pack is refused
 * rather than simply that it was.
 */
function assess(classificationId, profileId) {
  const c = classification(classificationId);
  const d = profiles.describe(profileId);
  const checks = c.requires.map((g) => {
    const G = GUARANTEES[g];
    return { guarantee: g, label: G.label, detail: G.detail, holds: G.holds(d) };
  });
  const unmet = checks.filter((x) => !x.holds);
  return {
    ok: unmet.length === 0,
    classification: c.id,
    classification_title: c.title,
    rank: c.rank,
    profile: d.profile,
    profile_title: d.title,
    checks,
    unmet: unmet.map((x) => x.guarantee),
    reasons: unmet.map((x) => `${d.title} does not provide "${x.label}" — ${x.detail}.`),
    eligible_profiles: eligibleProfiles(c.id),
  };
}

/** Is this pack a Sovereign Intelligence Pack? (Structural, not by naming.) */
const isSovereign = (pack) => !!(pack && pack.sovereign && pack.sovereign.classification);

/** The classification a pack requires, or null for an Industry Pack. */
const classificationOf = (pack) => (isSovereign(pack) ? classification(pack.sovereign.classification) : null);

/**
 * Assess a PACK against the active (or a named) deployment. An ordinary
 * Industry Pack is admissible everywhere — Phase 7 introduces no new constraint
 * on the eight packs that shipped before it.
 */
function assessPack(pack, { profile: profileId = null } = {}) {
  if (!isSovereign(pack)) {
    const d = profiles.describe(profileId);
    return { ok: true, sovereign: false, classification: null, profile: d.profile, profile_title: d.title, checks: [], unmet: [], reasons: [], eligible_profiles: profiles.PROFILE_IDS };
  }
  return { ...assess(pack.sovereign.classification, profileId), sovereign: true };
}

/**
 * The installation gate. Called by industry.install() BEFORE anything is
 * drafted, so a refusal leaves the enterprise untouched — a pack is never half
 * installed and then rejected.
 */
function assertInstallable(pack, { profile: profileId = null } = {}) {
  const a = assessPack(pack, { profile: profileId });
  if (a.ok) return a;
  throw new SovereigntyError(
    `${pack.title} requires a ${a.classification_title} deployment and this is ${a.profile_title}. ` +
    `${a.reasons.join(" ")} Eligible deployment profiles: ${a.eligible_profiles.join(", ")}.`,
  );
}

// ── Posture (the operator-facing summary) ───────────────────────────────────

/**
 * What THIS deployment can host, read from the running process rather than from
 * configuration someone described. Used by the Control Room's Sovereign tab and
 * by `guardian verify`.
 */
function posture(profileId) {
  const d = profiles.describe(profileId);
  const admissible = admissibleClassifications(d.profile);
  const highest = admissible.length ? classification(admissible[admissible.length - 1]) : null;
  return {
    profile: d.profile,
    profile_title: d.title,
    sovereign_capable: admissible.includes("secret"),
    admissible_classifications: admissible,
    highest: highest ? { id: highest.id, title: highest.title, rank: highest.rank } : null,
    guarantees: GUARANTEE_IDS.map((g) => ({ guarantee: g, label: GUARANTEES[g].label, detail: GUARANTEES[g].detail, holds: GUARANTEES[g].holds(d) })),
  };
}

/** All tiers with their derived eligibility — for the CLI, the API and docs. */
const list = () => CLASSIFICATIONS.map((c) => ({
  id: c.id, rank: c.rank, title: c.title, summary: c.summary,
  requires: c.requires.map((g) => ({ guarantee: g, label: GUARANTEES[g].label, detail: GUARANTEES[g].detail })),
  eligible_profiles: eligibleProfiles(c.id),
}));

module.exports = {
  SovereigntyError, GUARANTEES, GUARANTEE_IDS, CLASSIFICATIONS, CLASSIFICATION_IDS, DEFAULT_CLASSIFICATION,
  normalise, classification, eligibleProfiles, admissibleClassifications,
  assess, assessPack, assertInstallable, isSovereign, classificationOf, posture, list,
};
