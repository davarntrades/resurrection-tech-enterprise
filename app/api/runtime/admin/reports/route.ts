/** Runtime Governance — operator-scoped governance reports for a tenant.
 *   GET  ?org_id=…[&environment_id=][&period=daily|weekly|monthly|quarterly]  → list
 *   POST { org_id, environment_id?, period }                                  → generate one
 * Operator-authed (session cookie OR x-admin-key). */
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
  const org_id = sp.get("org_id") || "";
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  return NextResponse.json({
    reports: await rt.reports.listReports({
      org_id, environment_id: sp.get("environment_id") || undefined, period: sp.get("period") || undefined,
    }),
  });
}

export async function POST(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const org_id = String(body?.org_id || "");
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  if (!rt.reports.PERIODS.includes(body?.period))
    return NextResponse.json({ error: `period must be one of ${rt.reports.PERIODS.join("|")}` }, { status: 400 });
  try {
    const report = await rt.reports.generate({ org_id, environment_id: body?.environment_id || undefined, period: body.period, ref: body?.ref });
    await rt.adminaudit.record({ action: "generate_report", actor: authz.identity, via: authz.via, target: org_id, meta: { period: body.period } });
    return NextResponse.json({ ok: true, report });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "report generation failed" }, { status: 500 });
  }
}
