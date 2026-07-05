/** Runtime Governance — operational alerts (Phase 3).
 *   GET  ?org_id=&environment_id=&limit=  → live conditions + recent raised alerts
 *   POST                                  → run a sweep now (evaluate + raise)
 * Auth: operator session OR x-admin-key. */
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

export async function GET(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const org_id = sp.get("org_id") || undefined;
  const environment_id = sp.get("environment_id") || undefined;
  const limit = Math.min(Number(sp.get("limit")) || 100, 500);
  const [conditions, recent] = await Promise.all([
    rt.alerts.evaluate({ org_id, environment_id }),
    rt.alerts.list({ org_id, limit }),
  ]);
  return NextResponse.json({ conditions, recent });
}

export async function POST(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  const result = await rt.alerts.sweep();
  await rt.adminaudit.record({ action: "alerts_sweep", actor: authz.identity, via: authz.via, meta: result });
  return NextResponse.json({ ok: true, ...result });
}
