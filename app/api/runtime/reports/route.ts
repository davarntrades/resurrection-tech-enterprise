/** Runtime Governance — continuous reporting.
 * GET  ?period=daily|weekly|monthly|quarterly → list persisted reports
 * POST { period } → generate a new report for the window */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bearer = (req: NextRequest) => (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();

export async function GET(req: NextRequest) {
  const auth = await rt.admin.authenticate(bearer(req));
  if (!auth) return NextResponse.json({ error: "valid API key required" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  return NextResponse.json(await rt.reports.listReports({
    org_id: auth.org.id,
    environment_id: sp.get("all") ? undefined : (auth.environment ? auth.environment.id : undefined),
    period: sp.get("period") || undefined,
  }));
}

export async function POST(req: NextRequest) {
  const auth = await rt.admin.authenticate(bearer(req));
  if (!auth) return NextResponse.json({ error: "valid API key required" }, { status: 401 });
  let body: any = {}; try { body = await req.json(); } catch { /* empty */ }
  if (!rt.reports.PERIODS.includes(body.period))
    return NextResponse.json({ error: `period must be one of ${rt.reports.PERIODS.join("|")}` }, { status: 400 });
  const report = await rt.reports.generate({
    org_id: auth.org.id,
    environment_id: auth.environment ? auth.environment.id : undefined,
    period: body.period, ref: body.ref,
  });
  return NextResponse.json(report);
}
