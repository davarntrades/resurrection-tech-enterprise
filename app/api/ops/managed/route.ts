/** Guardian OS — Managed Governance (Phase 3): continuous governance of a
 *  provisioned enterprise.
 *   GET                              → posture across every provisioned enterprise
 *   GET ?view=health&org_id=…        → live governance health score (7 sub-scores + trend)
 *   GET ?view=drift&org_id=…         → open Governance Drift events
 *   GET ?view=queue&org_id=…         → the operator queue (only what needs a human)
 *   GET ?view=briefing&org_id=…&period=daily|weekly|monthly
 *   GET ?view=packs&org_id=…         → generated evidence packs (metadata)
 *   GET ?view=pack&pack_id=…&org_id=… → one full evidence pack
 *     (operator session/admin key, or client key with `status` scope — read-only)
 *   POST { action:'monitor', org_id }        → one continuous monitoring pass
 *   POST { action:'capture_baseline', org_id }
 *   POST { action:'recommend', org_id }       → generate governed recommendations
 *   POST { action:'evidence_pack', org_id, period? } → build a signed evidence pack
 *   POST { action:'ack_drift', drift_id, status? }   → operator disposition
 *
 * Everything read here is a derived projection; recommendations are governed
 * proposals (inert until an operator approves). No privileged action is taken. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
  const M: any = ops.managed;
  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "";
  const org_id = url.searchParams.get("org_id") || "";
  if (view === "health") return NextResponse.json({ health: await M.health(org_id), history: await M.healthHistory(org_id) });
  if (view === "drift") return NextResponse.json({ drift: await M.detectDrift(org_id) });
  if (view === "queue") return NextResponse.json({ queue: await M.queue(org_id) });
  if (view === "briefing") return NextResponse.json({ briefing: await M.briefingFor(org_id, { period: url.searchParams.get("period") || "daily" }) });
  if (view === "packs") return NextResponse.json({ packs: await M.listPacks(org_id) });
  if (view === "pack") {
    const pack_id = url.searchParams.get("pack_id") || "";
    const row = await rt.store.findOne("evidence_packs", { id: pack_id });
    if (!row || (org_id && row.org_id !== org_id)) return NextResponse.json({ error: "pack not found" }, { status: 404 });
    return NextResponse.json({ pack: { id: row.id, hash: row.hash, ...row.payload } });
  }
  return NextResponse.json({ overview: await M.overview() });
}

export async function POST(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body?.action || "");
  const org_id = String(body?.org_id || "");
  const M: any = ops.managed;
  try {
    if (action === "monitor") return NextResponse.json({ ok: true, result: await M.monitor(org_id, { actor: op.identity }) });
    if (action === "capture_baseline") return NextResponse.json({ ok: true, baseline: await M.captureBaseline(org_id, { actor: op.identity }) });
    if (action === "recommend") return NextResponse.json({ ok: true, result: await M.recommend(org_id, { actor: op.identity }) });
    if (action === "evidence_pack") return NextResponse.json({ ok: true, pack: await M.evidencePack(org_id, { period: body?.period || null, actor: op.identity }) });
    if (action === "ack_drift") return NextResponse.json({ ok: true, drift: await M.ackDrift(String(body?.drift_id || ""), { actor: op.identity, status: body?.status || "acknowledged" }) });
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "managed governance action failed" }, { status: 400 });
  }
}
