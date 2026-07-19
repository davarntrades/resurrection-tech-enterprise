/** Operations Agent — external client key management (operator-only).
 *   GET                          → list client keys (hashes never returned)
 *   POST { label, scopes[] }     → issue a key (plaintext shown once)
 *   POST { id, revoke: true }    → revoke */
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
  const C: any = ops.clients;
  return NextResponse.json({ clients: await C.list(), scopes: C.SCOPES });
}

export async function POST(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const C: any = ops.clients;
  try {
    if (body?.id && body?.revoke) {
      await C.revoke(String(body.id));
      await rt.adminaudit.record({ action: "ops_revoke_client_key", actor: op.identity, via: op.via, target: null, meta: { id: body.id } });
      return NextResponse.json({ ok: true });
    }
    const issued = await C.issue({ label: body?.label, scopes: body?.scopes });
    await rt.adminaudit.record({ action: "ops_issue_client_key", actor: op.identity, via: op.via, target: null, meta: { id: issued.id, label: issued.label, scopes: issued.scopes } });
    return NextResponse.json({ ok: true, client: issued }); // key shown once
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "client key operation failed" }, { status: 400 });
  }
}
