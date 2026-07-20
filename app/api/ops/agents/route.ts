/** Operations Agent — Multi-Agent Core (Pillar 4).
 *   GET                → roster: five specialists with charter, live workload,
 *                        recent attributed proposals, and stage ownership.
 *     (operator session/admin key, or client key with `status` scope — read-only)
 *   GET ?view=council  → read-only assessment: what each specialist would
 *                        propose right now (no side effects).
 *   POST { }           → run the governed multi-agent cycle (operator-only). Each
 *                        specialist proposes through the SHARED governor; charter
 *                        + Runtime Governance both apply. No agent gets elevated
 *                        trust — high-risk transitions still escalate for approval. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function operator(req: NextRequest) {
  return rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
}

export async function GET(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) {
    const key = req.headers.get("x-ops-client-key") || "";
    const client = await (ops.clients as any).authenticate(key, { requireScope: "status" });
    if (!client.ok) return NextResponse.json({ error: "operator or client authentication required" }, { status: 401 });
  }
  const A: any = ops.agents;
  const view = new URL(req.url).searchParams.get("view") || "";
  if (view === "council") return NextResponse.json({ council: await A.council() });
  return NextResponse.json(await A.roster());
}

export async function POST(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  try {
    const result = await (ops.agents as any).dispatch({ trigger: "control_room" });
    await rt.adminaudit.record({ action: "ops_council_dispatch", actor: op.identity, via: op.via, target: null, meta: { run_id: result.run_id, proposals: (result.proposals || []).length } });
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "council dispatch failed" }, { status: 400 });
  }
}
