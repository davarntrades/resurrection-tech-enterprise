/** Runtime Governance — flip an environment's mode (shadow ⇄ enforce).
 * The dashboard toggle over admin.setMode(). Auth: operator session OR
 * x-admin-key. Every flip is recorded in the admin action audit. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(req: NextRequest) {
  return rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
}

export async function POST(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const environment_id = String(body?.environment_id || "");
  const mode = String(body?.mode || "");
  if (!environment_id) return NextResponse.json({ error: "environment_id required" }, { status: 400 });
  if (!["shadow", "enforce"].includes(mode)) return NextResponse.json({ error: "mode must be 'shadow' or 'enforce'" }, { status: 400 });

  try {
    const before = await rt.admin.getEnvironment(environment_id);
    if (!before) return NextResponse.json({ error: "environment not found" }, { status: 404 });
    const environment = await rt.admin.setMode(environment_id, mode);
    await rt.adminaudit.record({ action: "set_mode", actor: authz.identity, via: authz.via, target: environment_id, meta: { from: before.mode, to: mode } });
    return NextResponse.json({ ok: true, environment });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "set-mode failed" }, { status: 500 });
  }
}
