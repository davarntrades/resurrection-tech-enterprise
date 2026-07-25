/**
 * Guardian OS — Sovereign Intelligence Packs: the typed contract (Phase 7).
 *
 * The runtime services live in CommonJS under lib/ops (they are shared with the
 * `guardian` CLI, the offline bundle format and the Node test harness, none of
 * which run through the Next.js compiler). This module is the TYPED FRONT DOOR
 * to that registry for everything on the TypeScript side: the commercial
 * website, the Control Room and the API routes.
 *
 * It adds no behaviour and holds no state. It is the pack contract expressed as
 * types, plus thin readers over the ONE registry — so the public catalog page
 * and the operator's install list can never drift apart, because they are the
 * same data with the same shape.
 *
 * Everything here is serialisable. A pack's projections are platform code and
 * deliberately do not appear in these types: a Sovereign Intelligence Pack is
 * data, and the type system says so.
 */

/* eslint-disable @typescript-eslint/no-var-requires */

// ── Deployment + classification ─────────────────────────────────────────────

/** Where Guardian OS runs. Deployment is a separate concern from domain. */
export type DeploymentProfileId =
  | "cloud"
  | "hybrid"
  | "private_cloud"
  | "on_prem"
  | "sovereign"
  | "air_gapped";

/** The handling bar a pack requires of the deployment beneath it. */
export type ClassificationId = "official" | "official_sensitive" | "secret" | "top_secret";

/** A guarantee a deployment either provides or does not. Never assumed. */
export interface Guarantee {
  guarantee: string;
  label: string;
  detail: string;
  holds?: boolean;
}

export interface Classification {
  id: ClassificationId;
  rank: number;
  title: string;
  summary: string;
  requires: Guarantee[];
  /** DERIVED from the profiles that satisfy `requires` — never hand-written. */
  eligible_profiles: DeploymentProfileId[];
}

/** The answer to "may this pack be installed on this deployment?", with reasons. */
export interface Admissibility {
  ok: boolean;
  sovereign: boolean;
  classification: ClassificationId | null;
  classification_title?: string;
  rank?: number;
  profile: DeploymentProfileId;
  profile_title: string;
  checks: Guarantee[];
  unmet: string[];
  /** Human-readable reasons a refusal happened. Empty when `ok`. */
  reasons: string[];
  eligible_profiles: DeploymentProfileId[];
}

/** What this deployment can host, read from the running process. */
export interface SovereignPosture {
  profile: DeploymentProfileId;
  profile_title: string;
  sovereign_capable: boolean;
  admissible_classifications: ClassificationId[];
  highest: { id: ClassificationId; title: string; rank: number } | null;
  guarantees: Guarantee[];
}

// ── The declarative pack contract ───────────────────────────────────────────

/** A deny-only Ω policy, in the kernel's EXISTING domain vocabulary. */
export interface PackPolicy {
  name: string;
  domain: string;
  spec: {
    match: { tools: string[] };
    conditions?: {
      unauthorized_unless?: string[];
      flag_true_blocks?: string[];
      threshold?: { field: string; op: string; value: number };
    };
    severity?: "critical" | "warning" | "info";
  };
}

export interface EvidenceMapping {
  regulation: string;
  control: string;
  evidence: string;
}

export interface IncidentWorkflow {
  kind: string;
  severity: string;
  steps: string[];
}

/** Who may authorise what, and to whom that authority delegates. */
export interface AuthorityChain {
  id: string;
  title: string;
  authority: string;
  delegates_to: string[];
  authorises: string[];
  evidence: string;
}

export interface WorkflowStage {
  name: string;
  actor: string;
  gate: string;
}

/** A governed mission workflow, stage by stage. */
export interface MissionWorkflow {
  id: string;
  title: string;
  purpose: string;
  stages: WorkflowStage[];
  evidence?: string;
}

/** A capability the pack governs, and the Ω policies standing behind it. */
export interface GovernedCapability {
  id: string;
  title: string;
  detail?: string;
  governed_by: string[];
}

/**
 * An operational readiness measure and the source that grounds it. The source
 * grammar is CLOSED — a measure whose source the platform cannot resolve is
 * rendered as an explicit note, never as a number.
 */
export interface ReadinessMeasure {
  key: string;
  label: string;
  detail?: string;
  source: string;
}

export interface RiskModel {
  id: string;
  title: string;
  factors: string[];
  escalates_when?: string;
}

/** Which parts of the ONE governed twin carry mission meaning for this domain. */
export interface TwinProjection {
  id: string;
  title: string;
  entity_kinds: string[];
  reads?: string;
}

export interface Briefing {
  id: string;
  title: string;
  audience: string;
  sections: string[];
}

export interface PackReport {
  id: string;
  title: string;
  audience: string;
  cadence: string;
  contents: string[];
}

/** The sovereign extension block. Data only — there is no function here. */
export interface SovereignBlock {
  classification: ClassificationId;
  mission_domain: string;
  mission: string;
  authority_chains: AuthorityChain[];
  workflows: MissionWorkflow[];
  capabilities: GovernedCapability[];
  readiness: ReadinessMeasure[];
  risk_models: RiskModel[];
  twin_projections: TwinProjection[];
  briefings: Briefing[];
  reports: PackReport[];
}

/**
 * A Sovereign Intelligence Pack, in full. Note what is absent: there is no
 * field of function type anywhere in this interface, and that is the contract,
 * not an oversight. Projections are platform code (lib/ops/packs/sovereign/
 * projections.js), shared by every sovereign pack.
 */
export interface SovereignPack {
  id: string;
  version: string;
  industry: string;
  title: string;
  purpose: string;
  match: string[];
  regulations: string[];
  policies: PackPolicy[];
  templates: PackPolicy[];
  evidence_mappings: EvidenceMapping[];
  incident_workflows: IncidentWorkflow[];
  sovereign: SovereignBlock;
}

/** Catalog metadata — the serialisable summary every surface renders from. */
export interface SovereignPackMeta {
  id: string;
  version: string;
  industry: string;
  title: string;
  purpose: string;
  sovereign: true;
  classification: ClassificationId;
  classification_title: string;
  classification_rank: number;
  eligible_profiles: DeploymentProfileId[];
  mission_domain: string;
  mission: string;
  regulations: string[];
  counts: {
    policies: number;
    templates: number;
    mappings: number;
    workflows: number;
    authority_chains: number;
    mission_workflows: number;
    capabilities: number;
    readiness: number;
    risk_models: number;
    twin_projections: number;
    briefings: number;
    reports: number;
  };
}

/** A catalog entry with live admissibility for a given deployment. */
export interface SovereignPackListing extends SovereignPackMeta {
  admissibility: Admissibility;
}

// ── Readers over the ONE registry ───────────────────────────────────────────

interface SovereignRegistry {
  all(): SovereignPack[];
  get(id: string): SovereignPack | null;
  catalog(): SovereignPackMeta[];
  declarative(pack: SovereignPack): SovereignPack;
  PACK_IDS: string[];
}

interface SovereigntyModule {
  list(): Classification[];
  posture(profile?: string | null): SovereignPosture;
  assessPack(pack: unknown, opts?: { profile?: string | null }): Admissibility;
  eligibleProfiles(id: string): DeploymentProfileId[];
  classification(id: string): { id: ClassificationId; rank: number; title: string; summary: string };
  CLASSIFICATION_IDS: ClassificationId[];
}

const registry: SovereignRegistry = require("@/lib/ops/packs/sovereign");
const sovereignty: SovereigntyModule = require("@/lib/ops/sovereignty");

/** Every Sovereign Intelligence Pack, in full declarative form. */
export function packs(): SovereignPack[] {
  return registry.all().map((p) => registry.declarative(p));
}

/** One pack by id, or null. */
export function pack(id: string): SovereignPack | null {
  const p = registry.get(id);
  return p ? registry.declarative(p) : null;
}

/** The catalog — the shape the website and the Control Room both render. */
export function catalog(): SovereignPackMeta[] {
  return registry.catalog();
}

/**
 * The catalog with LIVE admissibility for a deployment profile. The commercial
 * catalog and the operator's install list are the same list: a pack that a
 * deployment cannot host says so on the marketing page and in the Control Room,
 * in the same words.
 */
export function catalogFor(profile?: DeploymentProfileId | null): SovereignPackListing[] {
  return registry.all().map((p) => ({
    ...registry.catalog().find((m) => m.id === p.id)!,
    admissibility: sovereignty.assessPack(p, { profile: profile ?? null }),
  }));
}

/** The classification tiers, with their derived eligible deployment profiles. */
export function classifications(): Classification[] {
  return sovereignty.list();
}

/** What a given deployment profile is able to host. */
export function posture(profile?: DeploymentProfileId | null): SovereignPosture {
  return sovereignty.posture(profile ?? null);
}

/** Aggregate figures for the public catalog page. Read from the registry, so a
 *  published number can never drift from what actually ships. */
export function totals(): {
  packs: number;
  policies: number;
  authorityChains: number;
  missionWorkflows: number;
  capabilities: number;
  evidenceMappings: number;
  incidentWorkflows: number;
  twinProjections: number;
  readiness: number;
  reports: number;
  kernels: 1;
} {
  const rows = registry.catalog();
  const sum = (pick: (c: SovereignPackMeta["counts"]) => number) => rows.reduce((n, r) => n + pick(r.counts), 0);
  return {
    packs: rows.length,
    policies: sum((c) => c.policies),
    authorityChains: sum((c) => c.authority_chains),
    missionWorkflows: sum((c) => c.mission_workflows),
    capabilities: sum((c) => c.capabilities),
    evidenceMappings: sum((c) => c.mappings),
    incidentWorkflows: sum((c) => c.workflows),
    twinProjections: sum((c) => c.twin_projections),
    readiness: sum((c) => c.readiness),
    reports: sum((c) => c.reports),
    // Not a count — an invariant. Every sovereign domain runs on this one.
    kernels: 1,
  };
}
