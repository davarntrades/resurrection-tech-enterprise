/**
 * Universal governed execution endpoint.
 *
 * Authentication and Morrison authorization happen in this request. A caller
 * supplied verdict is ignored: only gateway.govern() can mint execution
 * authority, and only a recorded ALLOW reaches an adapter.
 */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(req: NextRequest): string {
  const match = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export async function POST(req: NextRequest) {
  const auth = await rt.admin.authenticate(bearer(req));
  if (!auth) return NextResponse.json({ error: "valid API key required (Authorization: Bearer <key>)" }, { status: 401 });
  if (auth.role === "viewer") return NextResponse.json({ error: "ingest role required" }, { status: 403 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON body required" }, { status: 400 }); }
  if (!Array.isArray(body?.trajectory) || !body.trajectory.length) return NextResponse.json({ error: "trajectory required" }, { status: 400 });
  if (typeof body?.adapter !== "string" || !body.adapter) return NextResponse.json({ error: "adapter id required" }, { status: 400 });
  if (body.morrison_verdict != null || body.verdict != null || body.authorization != null) {
    return NextResponse.json({ error: "client-supplied authorization or verdict is not accepted" }, { status: 400 });
  }

  await (rt.integrationGateway as any).recordUsage({
    org_id: auth.org.id, environment_id: auth.environment?.id || null, key_id: auth.key_id,
    operation: "runtime:execute", sdk: req.headers.get("x-guardian-sdk") || null,
  }).catch(() => { /* telemetry never breaks governance */ });

  const result = await (rt.executionAdapters as any).governAndExecute({
    auth, trajectory: body.trajectory, domains: body.domains, horizon: body.horizon,
    label: body.label, agent: body.agent, adapter: body.adapter,
    adapterConfig: body.adapter_config || {}, context: body.context || {},
    correlationId: body.correlation_id, requestId: req.headers.get("x-request-id") || undefined,
    idempotencyKey: body.idempotency_key,
  });
  const status = result.ok || ["BLOCK", "ESCALATE"].includes(result.verdict) ? 200
    : result.error?.code === "UNKNOWN_ADAPTER" || result.error?.code === "INVALID_ADAPTER_CONFIGURATION" ? 400 : 502;
  return NextResponse.json(result, { status, headers: { "cache-control": "no-store" } });
}
