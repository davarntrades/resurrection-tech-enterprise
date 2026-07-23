/** Operations Agent — Gmail status + read-only inbox (v1).
 *   GET               → connection status + recent inbound email events
 *     (operator session/admin key, or client key with `status` scope)
 *   GET ?org_id=<id>  → that customer's recent inbound emails
 *   POST { action }   → operator-only 'poll' (read new mail into evidence) or
 *     'disconnect' (revoke + drop the stored token).
 *   Read-only: there is NO send/reply/delete/archive/modify path here. */
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
  const G: any = ops.gmail;
  const org_id = new URL(req.url).searchParams.get("org_id") || "";
  const [status, events] = await Promise.all([G.status(), G.recentEvents({ org_id: org_id || undefined, limit: 50 })]);
  return NextResponse.json({ status, events });
}

export async function POST(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body?.action || "");
  const G: any = ops.gmail;
  if (action === "poll") {
    const result = await G.poll({ actor: op.identity });
    await rt.adminaudit.record({ action: "ops_gmail_poll", actor: op.identity, via: op.via, target: null, meta: { new: result.new, fetched: result.fetched } });
    return NextResponse.json({ ok: !!result.ok, result });
  }
  if (action === "disconnect") {
    const result = await G.disconnect();
    await rt.adminaudit.record({ action: "ops_gmail_disconnected", actor: op.identity, via: op.via, target: null, meta: {} });
    return NextResponse.json({ ok: true, result });
  }
  return NextResponse.json({ error: "action must be 'poll' or 'disconnect'" }, { status: 400 });
}
