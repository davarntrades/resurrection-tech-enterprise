/** Operations Agent — Governed Lifecycle State Machine (Pillar 3).
 *   GET                → platform lifecycle summary (orgs by stage, next actions)
 *   GET ?org_id=<id>   → one org's state + transition history + approval history
 *     (operator session/admin key, or client key with `status` scope — read-only)
 *   POST { org_id }    → advance one governed step (operator-only). This PROPOSES
 *     the transition through Runtime Governance; privileged transitions escalate
 *     for approval, never auto-execute. */
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
  const W: any = ops.workflow;
  const org_id = new URL(req.url).searchParams.get("org_id") || "";
  if (org_id) {
    const [state, history, approvals] = await Promise.all([W.state(org_id), W.history(org_id), W.approvals(org_id)]);
    return NextResponse.json({ state, history, approvals, stages: W.STAGES });
  }
  return NextResponse.json({ summary: await W.summary(), stages: W.STAGES });
}

export async function POST(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const org_id = String(body?.org_id || "");
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  try {
    const result = await (ops.workflow as any).advance(org_id, { actor: op.identity, source: "lifecycle_control_room" });
    await rt.adminaudit.record({ action: "ops_lifecycle_advance", actor: op.identity, via: op.via, target: org_id, meta: { from: result.from, to: result.to, status: result.status } });
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "advance failed" }, { status: 400 });
  }
}
