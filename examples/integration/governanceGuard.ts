/**
 * Morrison Runtime Governance — drop-in pre-execution guard (TypeScript).
 *
 * One async call at your agent's plan -> act boundary. The governance service
 * NEVER executes your tool; it inspects the proposed tool call and returns a
 * deterministic verdict before you run anything:
 *
 *   PERMIT   -> execute the tool
 *   ESCALATE -> hold for a human (sign-off); a review card says who + why
 *   BLOCK    -> deny before execution
 *
 * Env:
 *   GOVERNANCE_URL    base URL of the service (hosted or self-hosted)
 *   GOVERNANCE_TOKEN  optional Bearer token if the service requires auth
 */

export type Verdict = "PERMIT" | "ESCALATE" | "BLOCK";

export interface ReviewCard {
  reason: string;
  required_action: string;
  decision_authority: string;
  next_step: string;
  execution_status: string; // "HELD FOR HUMAN REVIEW"
}

export interface GovernanceResult {
  verdict: Verdict;
  permitted: boolean;
  blocked: boolean;
  layer: string;
  reason: string;
  omega_domain: string | null;
  trajectory_hash: string;
  requires_human_review?: boolean;
  review?: ReviewCard;
  attestation?: { engine_commit: string; ruleset_hash: string };
}

export interface ToolCall {
  tool: string;
  args?: Record<string, unknown>;
}

const BASE_URL = (process.env.GOVERNANCE_URL ?? "http://localhost:8000").replace(/\/$/, "");
const TOKEN = process.env.GOVERNANCE_TOKEN;

export class GovernanceBlocked extends Error {
  constructor(public result: GovernanceResult) { super(result.reason); }
}
export class GovernanceEscalation extends Error {
  constructor(public result: GovernanceResult) { super(result.review?.reason ?? "Held for human review"); }
}

/** Evaluate a proposed trajectory (one or more tool calls) before execution. */
export async function governanceCheck(
  trajectory: ToolCall[],
  opts: { domains?: string[]; horizon?: number; timeoutMs?: number } = {},
): Promise<GovernanceResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 4000);
  try {
    const res = await fetch(`${BASE_URL}/v1/evaluate`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}) },
      body: JSON.stringify({ trajectory, domains: opts.domains, horizon: opts.horizon }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`governance service ${res.status}`);
    return (await res.json()) as GovernanceResult;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Gate a single tool dispatch. Call this right before your agent executes a
 * tool. Runs the tool only on PERMIT; routes to `onEscalate` on ESCALATE;
 * throws GovernanceBlocked on BLOCK — so a denied/held action never runs.
 */
export async function guardedDispatch<T>(
  call: ToolCall,
  run: (call: ToolCall) => Promise<T> | T,
  onEscalate?: (r: GovernanceResult) => Promise<T> | T,
  opts: { domains?: string[] } = {},
): Promise<T> {
  const v = await governanceCheck([call], opts);
  if (v.permitted) return run(call);                       // ALLOW
  if (v.verdict === "ESCALATE") {
    if (onEscalate) return onEscalate(v);                  // ESCALATE -> human
    throw new GovernanceEscalation(v);
  }
  throw new GovernanceBlocked(v);                          // BLOCK
}
