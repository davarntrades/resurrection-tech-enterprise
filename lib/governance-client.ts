/**
 * Client + adapter for the real Morrison Runtime Governance service.
 *
 * The website's API route calls `evaluateViaGovernance()`; on any failure
 * (unset URL, network, non-2xx, timeout) it throws and the route falls back to
 * the in-process heuristic `evaluateTrajectory()`. The UI contract is the
 * existing `EvalResult` shape — this module maps the engine's GovernanceResult
 * onto it WITHOUT inventing engine fields. Business-language copy
 * (businessImpact / protectedAssets / …) is reused from the existing
 * `OMEGA_META` lookup keyed by the engine's rule / Ω domain.
 */

import { OMEGA_META, type EvalResult, type StepSummary, type ToolCall, type Verdict } from "@/lib/trajectory-eval";

/** Raw shape returned by the FastAPI service (GovernanceResult.to_dict + extras). */
interface GovernanceResponse {
  verdict: "PERMIT" | "BLOCK" | "NO_VALID_SOLUTION" | "ENVIRONMENT_SENSITIVE";
  permitted: boolean;
  blocked: boolean;
  layer: string;
  reason: string;
  omega_domain: string | null;
  trajectory_hash: string;
  reachability_distance: number | null;
  metadata: Record<string, unknown> | null;
  steps?: { tool: string; args?: Record<string, unknown> }[];
}

const TIMEOUT_MS = Number(process.env.GOVERNANCE_TIMEOUT_MS ?? "4000");

/** Live Morrison governance service (Railway). Overridable via GOVERNANCE_URL. */
const DEFAULT_GOVERNANCE_URL = "https://resurrection-tech-enterprise-production.up.railway.app";

/** Engine rule / domain names → the demo's OMEGA_META presentation keys. */
const META_KEY: Record<string, keyof typeof OMEGA_META> = {
  unauthorized_transfer: "unauthorized_transfer",
  excessive_amount: "unauthorized_transfer",
  credential_exfiltration: "credential_exfiltration",
  shell_injection: "arbitrary_code_execution",
  privilege_escalation: "privilege_escalation",
  pii_exfiltration: "data_exfiltration",
  customer_pii_external: "data_exfiltration",
  internal_artifact_leak: "data_exfiltration",
  phi_exposure: "data_exfiltration",
  path_traversal: "path_traversal",
};

function metaFor(rule: string | undefined, domain: string | null) {
  const key = (rule && META_KEY[rule]) || (domain && META_KEY[domain]);
  return key ? OMEGA_META[key] : undefined;
}

/** Map the engine verdict onto the demo's 3-state verdict (UI maps → ALLOW/BLOCK/ESCALATE). */
function mapVerdict(v: GovernanceResponse["verdict"]): Verdict {
  if (v === "PERMIT") return "PERMIT";
  if (v === "BLOCK" || v === "NO_VALID_SOLUTION") return "BLOCK";
  return "INCONCLUSIVE"; // ENVIRONMENT_SENSITIVE → escalate
}

/** Convert a real GovernanceResult into the existing EvalResult contract. */
export function mapGovernanceToEvalResult(g: GovernanceResponse, trajectory: ToolCall[]): EvalResult {
  const steps: StepSummary[] = trajectory.map((s, i) => ({ index: i + 1, tool: s.tool, summary: s.tool }));
  const verdict = mapVerdict(g.verdict);
  const rule = (g.metadata?.rule as string | undefined) ?? undefined;
  const meta = metaFor(rule, g.omega_domain);

  // Real engine signals, surfaced inside the existing explanation field (no new UI fields).
  const distance = g.reachability_distance;
  const distanceNote =
    distance !== null && distance !== undefined ? ` Reachable-set distance to Ω: ${distance}.` : "";
  const engineNote = " Evaluated by GovernanceLayer.evaluate_plan().";

  if (verdict === "BLOCK") {
    return {
      verdict: "BLOCK",
      layer: g.layer || "—",
      reason: g.reason,
      omega: rule ?? g.omega_domain ?? "reached",
      runtimeStatus: g.verdict === "NO_VALID_SOLUTION" ? "no admissible trajectory — denied" : "denied before execution",
      category: rule ?? g.omega_domain ?? "Forbidden state",
      explanation: g.reason + distanceNote + engineNote,
      omegaReachable: true,
      businessImpact: meta?.businessImpact ?? "Protected assets may be exposed before execution.",
      protectedAssets: meta?.protectedAssets ?? ["Internal Systems"],
      confidence: "High",
      omegaReason: meta?.omegaReason ?? "The trajectory creates a path into a forbidden state Ω.",
      estimatedConsequence: meta?.estimatedConsequence ?? "Material operational, financial, or regulatory exposure (illustrative).",
      steps,
    };
  }

  if (verdict === "INCONCLUSIVE") {
    // ENVIRONMENT_SENSITIVE / escalate-to-human classification.
    return {
      verdict: "INCONCLUSIVE",
      layer: g.layer || "V5",
      reason: "Environment-sensitive trajectory — escalated for human review before execution.",
      omega: "indeterminate",
      runtimeStatus: "escalated for human review before execution",
      category: g.omega_domain ?? "Environment-sensitive",
      explanation:
        (g.reason || "Safe under base conditions but unsafe under perturbation across the environment set ℰ.") +
        distanceNote +
        engineNote,
      omegaReachable: false,
      businessImpact: "Reachability is conditional on the environment. A human review is required before this trajectory runs.",
      protectedAssets: ["Pending human review"],
      confidence: "Escalate",
      omegaReason: "The verdict flips under environmental perturbation, so Ω may become reachable depending on conditions.",
      estimatedConsequence: "Undetermined — escalated for human review before execution.",
      steps,
    };
  }

  // PERMIT
  return {
    verdict: "PERMIT",
    layer: g.layer || "none",
    reason: g.reason || "No forbidden state Ω is reachable along the trajectory.",
    omega: "not reached",
    runtimeStatus: "eligible for execution",
    category: "None",
    explanation:
      (g.reason || "No step creates a path toward a forbidden state, so Ω stays out of reach.") + distanceNote + engineNote,
    omegaReachable: false,
    businessImpact: "No protected assets exposed.",
    protectedAssets: ["Remain inside approved boundaries."],
    confidence: "High",
    omegaReason: "No step creates a path toward a forbidden state, so Ω stays out of reach.",
    estimatedConsequence: "None — no protected assets exposed.",
    steps,
  };
}

/**
 * Call the real governance service. Throws on any failure so the caller can
 * fall back to the heuristic evaluator. Never executes a tool call.
 */
export async function evaluateViaGovernance(trajectory: ToolCall[]): Promise<EvalResult> {
  // Default to the live Railway deployment; override with GOVERNANCE_URL (e.g.
  // Vercel production env) to point at a different backend. Empty string ⇒
  // disabled (caller falls back to the heuristic).
  const base = (process.env.GOVERNANCE_URL ?? DEFAULT_GOVERNANCE_URL).trim();
  if (!base) throw new Error("GOVERNANCE_URL disabled");

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.GOVERNANCE_TOKEN) headers.authorization = `Bearer ${process.env.GOVERNANCE_TOKEN}`;

  const res = await fetch(`${base.replace(/\/$/, "")}/v1/evaluate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ trajectory }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`governance service ${res.status}`);

  const g = (await res.json()) as GovernanceResponse;
  if (!g || typeof g.verdict !== "string") throw new Error("governance service: malformed response");
  return mapGovernanceToEvalResult(g, trajectory);
}
