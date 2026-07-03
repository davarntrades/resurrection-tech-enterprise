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
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
