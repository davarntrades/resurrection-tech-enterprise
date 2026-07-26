/**
 * Continuous Runtime Governance — ingestion endpoint (production path).
 *
 * A customer's agents POST trajectories here with their ingest API key. This is
 * the hosted twin of scripts/runtime/server.cjs's /v1/runtime/evaluate: it
 * authenticates, governs via the live engine, records runtime evidence, and
 * returns ALLOW / ESCALATE / BLOCK honouring the environment's shadow/enforce
 * mode. The engine is never modified — this wraps it.
 */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(req: NextRequest): string {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

export async function POST(req: NextRequest) {
  const auth = await rt.admin.authenticate(bearer(req));
  if (!auth) return NextResponse.json({ error: "valid API key required (Authorization: Bearer <key>)" }, { status: 401 });
  if (auth.role === "viewer") return NextResponse.json({ error: "ingest role required" }, { status: 403 });
  await (rt.integrationGateway as any).recordUsage({
    org_id: auth.org.id, environment_id: auth.environment?.id || null, key_id: auth.key_id,
    operation: "runtime:evaluate", sdk: req.headers.get("x-guardian-sdk") || null,
  }).catch(() => { /* telemetry never breaks governance */ });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const result = await rt.gateway.govern({
    auth,
    trajectory: body.trajectory,
    domains: body.domains,
    horizon: body.horizon,
    label: body.label,
    agent: body.agent,
    correlation_id: body.correlation_id,
  });
  const eventEnvironment = auth.environment || (await rt.admin.listEnvironments(auth.org.id)).find((e: any) => e.kind === "production");
  if (result.ok && result.decision_id && eventEnvironment) {
    await (rt.integrationGateway as any).dispatchEvent({
      org_id: auth.org.id,
      environment_id: eventEnvironment.id,
      event_type: "decision.created",
      event_id: result.decision_id,
      payload: {
        decision_id: result.decision_id, verdict: result.verdict,
        engine_verdict: result.engine_verdict, mode: result.mode,
        omega_domain: result.omega_domain, rule: result.rule,
        recorded_at: result.recorded_at, correlation_id: body.correlation_id || null,
      },
    }).catch((e: any) => rt.log.warn("integration_webhook_dispatch_failed", {
      org_id: auth.org.id, environment_id: eventEnvironment.id,
      decision_id: result.decision_id, error: e?.message || String(e),
    }));
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
