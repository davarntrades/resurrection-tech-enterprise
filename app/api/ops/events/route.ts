/** Operations Agent — event system surface.
 *   GET  ?kind=&org_id=&since=&limit=  → recent events (operator-only)
 *   POST { kind, payload?, org_id? }   → ingest an external event (operator, or
 *                                        client key with events:write scope —
 *                                        e.g. GitHub webhook bridge, deploy
 *                                        hooks). Kinds are namespaced under
 *                                        external.* for ingested events. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function operator(req: NextRequest) {
  return rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
}

export async function GET(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  const url = new URL(req.url);
  const events = await (ops.events as any).list({
    kind: url.searchParams.get("kind") || undefined,
    org_id: url.searchParams.get("org_id") || undefined,
    since: url.searchParams.get("since") || undefined,
    limit: Number(url.searchParams.get("limit") || 100),
  });
  return NextResponse.json({ events });
}

export async function POST(req: NextRequest) {
  const op = operator(req);
  let source = "operator";
  if (!op.ok) {
    const key = req.headers.get("x-ops-client-key") || "";
    const client = await (ops.clients as any).authenticate(key, { requireScope: "events:write" });
    if (!client.ok) return NextResponse.json({ error: "authentication required" }, { status: 401 });
    source = `client:${client.client.label}`;
  }
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const kind = String(body?.kind || "").trim();
  if (!kind) return NextResponse.json({ error: "kind required" }, { status: 400 });
  const namespaced = kind.startsWith("external.") ? kind : `external.${kind}`;
  const row = await (ops.events as any).emit(namespaced, body?.payload || {}, { org_id: body?.org_id || null, source });
  return NextResponse.json({ ok: true, event: row ? { id: row.id, kind: namespaced } : { kind: namespaced } });
}
