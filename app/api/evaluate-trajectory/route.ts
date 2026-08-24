import { NextResponse } from "next/server";
import { trajectoryRequestSchema } from "@/lib/validation";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { evaluateTrajectory, type EvalResult } from "@/lib/trajectory-eval";
import { evaluateViaGovernanceDetailed } from "@/lib/governance-client";
import { frontierService } from "@/lib/frontier-server";
import type { RegulatoryExposure } from "@/lib/regulatory-exposure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Source = "morrison" | "heuristic";
type Resp = (EvalResult & { ok: true; source: Source; regulatoryExposure?: RegulatoryExposure }) | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Public demo endpoint: evaluates a proposed tool-call trajectory for reachable
 * forbidden states (Ω) before execution. It NEVER executes any submitted tool
 * call — it only inspects the JSON shape.
 *
 * TODO: Replace `evaluateTrajectory` with a call to the Morrison Runtime
 * Governance service. Core repo:
 * https://github.com/davarntrades/Morrison-Runtime-Governance
 */
export async function POST(req: Request): Promise<NextResponse<Resp>> {
  // ── Rate limit ────────────────────────────────────────────
  // Pure evaluation (no DB/email/cost), and the demo is click-through, so use
  // a dedicated, more generous bucket than the audit form's default.
  const rl = rateLimit(clientIp(req.headers), { bucket: "traj", max: 30 });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  // ── Parse ─────────────────────────────────────────────────
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Malformed JSON. Paste a valid tool-call array or { \"trajectory\": [...] }." },
      { status: 400 },
    );
  }

  // Accept either a bare array or { trajectory: [...] }.
  const candidate = Array.isArray(json) ? { trajectory: json } : json;

  // ── Validate shape (bounds length, rejects junk) ──────────
  const parsed = trajectoryRequestSchema.safeParse(candidate);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "trajectory";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    const first = parsed.error.issues[0]?.message ?? "Invalid trajectory.";
    return NextResponse.json({ ok: false, error: first, fieldErrors }, { status: 422 });
  }

  // ── Evaluate (pure; never executes anything) ──────────────
  // Prefer the real Morrison engine (GovernanceLayer.evaluate_plan via the
  // governance service). On any failure — unset URL, network, non-2xx, or
  // timeout — fall back to the in-process heuristic so the UI never breaks.
  let result: EvalResult;
  let source: Source = "heuristic";
  let regulatoryExposure: RegulatoryExposure | undefined;
  try {
    const detailed = await evaluateViaGovernanceDetailed(parsed.data.trajectory, parsed.data.domains);
    result = detailed.result;
    source = "morrison";
    const decisions = detailed.governance.decisions || [];
    const steps = parsed.data.trajectory.map((call, index) => {
      const decision = decisions[index] || decisions.at(-1) || {};
      return {
        step: index + 1,
        normalized_call: call,
        morrison_decision: {
          verdict: decision.verdict || detailed.governance.verdict,
          rule: decision.rule || detailed.governance.metadata?.rule,
          layer: decision.layer || detailed.governance.layer,
          reason: decision.reason || detailed.governance.reason,
          metadata: { capabilities: decision.capabilities || detailed.governance.metadata?.capabilities || [] },
        },
        // This public demo evaluates only. It has no executor.
        execution_occurred: false,
      };
    });
    try {
      const projection = await frontierService("/v1/frontier/regulatory-context", {
        method: "POST",
        body: JSON.stringify({ mode: "shadow", steps }),
      });
      if (projection.res.ok) regulatoryExposure = projection.data?.regulatory_exposure;
    } catch (projectionError) {
      console.warn("[evaluate-trajectory] regulatory projection unavailable:", (projectionError as Error).message);
    }
  } catch (err) {
    console.warn("[evaluate-trajectory] governance service unavailable, using heuristic fallback:", (err as Error).message);
    result = evaluateTrajectory(parsed.data.trajectory);

    // FAIL-CLOSED on degraded evaluation.
    //
    // The red-team surface-parity check found that this fallback could return
    // a PERMIT produced by the in-process heuristic — a different engine, with
    // none of the production Ω rules, none of the trust boundary and none of
    // the capability policy — while the UI rendered it as an ordinary "ALLOW".
    // A governance demo must never show a permit that the real engine did not
    // issue. When degraded, the strongest thing we may claim is "cannot
    // establish safety", so a heuristic PERMIT is downgraded to ESCALATE.
    if (result.verdict === "PERMIT") {
      result = {
        ...result,
        // "INCONCLUSIVE" is this UI's existing representation of "needs human
        // review" — `mapVerdict` in governance-client.ts already folds the
        // engine's ESCALATE into it. Reuse that rather than widening `Verdict`,
        // so every consumer that already handles the three-state contract keeps
        // working and the demo renders this as review-required, not ALLOW.
        verdict: "INCONCLUSIVE",
        reason:
          "Governance service unavailable — evaluated by the in-process heuristic, " +
          "which cannot establish that this trajectory is safe. Fail-closed: not permitted.",
      };
    }
  }

  // Surface the evaluation source to the UI so a heuristic fallback is never
  // presented as a real-engine verdict. Also kept as a header for observability.
  const res = NextResponse.json<Resp>({ ok: true, source, ...result, regulatoryExposure });
  res.headers.set("x-governance-source", source);
  return res;
}
