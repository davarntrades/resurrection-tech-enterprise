/** Operations Agent — executive dashboard aggregation (operator, or client key
 * with `status` scope). One payload for the Operations Dashboard tiles:
 * customers · audits · pilot readiness · deployment health · failed
 * evaluations · policy violations · runtime activity · agent recommendations ·
 * blocked actions. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const op = rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
  if (!op.ok) {
    const key = req.headers.get("x-ops-client-key") || "";
    const client = await (ops.clients as any).authenticate(key, { requireScope: "status" });
    if (!client.ok) return NextResponse.json({ error: "operator or client authentication required" }, { status: 401 });
  }

  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const [briefing, platform, integrations, proposals, evidence, escalated, blocked, runsList, metrics] = await Promise.all([
    (ops.briefing as any).briefing(),
    (rt.overview as any).platform().catch(() => null),
    (ops.integrations as any).probeAll(),
    (ops.proposals as any).summary(),
    (ops.evidence as any).summary({}),
    (ops.proposals as any).list({ status: "escalated", limit: 20 }),
    (ops.evidence as any).search({ verdict: "block", since: weekAgo, limit: 50 }),
    (ops.agent as any).runs({ limit: 5 }),
    rt.metrics.summary({ since: dayAgo }).catch(() => null),
  ]);

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    briefing,
    platform,                    // existing Control Room platform KPIs
    runtime_24h: metrics,        // runtime activity + failed evaluations
    integrations,                // deployment / infra health
    proposals,                   // agent recommendation pipeline counts
    blocked_actions: evidence.by_verdict?.block ?? 0,
    policy_violations_24h: evidence.blocked_24h ?? 0,
    awaiting_approval: escalated,
    blocked_evidence_7d: blocked,
    recent_runs: runsList,
  });
}
