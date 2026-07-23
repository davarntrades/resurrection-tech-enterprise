/** Operations Agent — incidents (Phase 2, Governed Action Execution).
 *   GET [?status=open&org_id=]  → incident ledger + summary
 *     (operator session/admin key, or client key with `status` scope — read-only)
 *   POST { id, action:'resolve', note? } → operator resolves an incident. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
  const I: any = ops.incidents;
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const org_id = url.searchParams.get("org_id") || undefined;
  const [incidents, summary] = await Promise.all([I.list({ status, org_id, limit: 100 }), I.summary()]);
  return NextResponse.json({ incidents, summary });
}

export async function POST(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const id = String(body?.id || "");
  if (String(body?.action || "") !== "resolve" || !id) return NextResponse.json({ error: "id and action:'resolve' required" }, { status: 400 });
  try {
    const incident = await (ops.incidents as any).resolve(id, { actor: op.identity, note: body?.note || null });
    return NextResponse.json({ ok: true, incident });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "resolve failed" }, { status: 400 });
  }
}
