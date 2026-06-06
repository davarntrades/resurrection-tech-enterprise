import { NextResponse } from "next/server";
import { trajectoryRequestSchema } from "@/lib/validation";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { evaluateTrajectory, type EvalResult } from "@/lib/trajectory-eval";
import { evaluateViaGovernance } from "@/lib/governance-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Source = "morrison" | "heuristic";
type Resp = (EvalResult & { ok: true; source: Source }) | { ok: false; error: string; fieldErrors?: Record<string, string> };

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
  try {
    result = await evaluateViaGovernance(parsed.data.trajectory, parsed.data.domains);
    source = "morrison";
  } catch (err) {
    console.warn("[evaluate-trajectory] governance service unavailable, using heuristic fallback:", (err as Error).message);
    result = evaluateTrajectory(parsed.data.trajectory);
  }

  // Surface the evaluation source to the UI so a heuristic fallback is never
  // presented as a real-engine verdict. Also kept as a header for observability.
  const res = NextResponse.json<Resp>({ ok: true, source, ...result });
  res.headers.set("x-governance-source", source);
  return res;
}
