/** Operations Agent — Agent Coordination Spine (Pillar 5).
 *   GET                → platform summary (handoffs by status + per-agent queues)
 *                        + blocked/escalated work list
 *   GET ?org_id=<id>   → the full handoff timeline for one org (chain of
 *                        responsibility, each linked to its governed proposal)
 *     (operator session/admin key, or client key with `status` scope — read-only)
 *   POST { id, action } → operator-only 'cancel' (supersede an open handoff) or
 *                        'retry' (reopen a blocked handoff for the next cycle).
 *     A handoff is a coordination record — this never executes anything; the
 *     next governed cycle proposes through Runtime Governance as usual. */
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
  const H: any = ops.handoffs;
  const org_id = new URL(req.url).searchParams.get("org_id") || "";
  if (org_id) return NextResponse.json({ org_id, timeline: await H.timeline(org_id) });
  const [summary, blocked] = await Promise.all([H.summary(), H.blockedWork({ limit: 50 })]);
  return NextResponse.json({ summary, blocked_work: blocked });
}

export async function POST(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const id = String(body?.id || "");
  const action = String(body?.action || "");
  if (!id || !["cancel", "retry"].includes(action)) return NextResponse.json({ error: "id and action ('cancel'|'retry') required" }, { status: 400 });
  const H: any = ops.handoffs;
  const existing = await H.get(id);
  if (!existing) return NextResponse.json({ error: "handoff not found" }, { status: 404 });
  const patch = action === "cancel" ? { status: "superseded" } : { status: "open", attempts: 0 };
  const handoff = await H.setStatus(id, patch);
  await rt.adminaudit.record({ action: `ops_handoff_${action}`, actor: op.identity, via: op.via, target: existing.org_id, meta: { handoff_id: id } });
  return NextResponse.json({ ok: true, handoff });
}
