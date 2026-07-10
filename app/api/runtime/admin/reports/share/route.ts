/** Runtime Governance — mint a secure link to a rendered report (HTML).
 *   POST { id, expires_in_days?, password? } → { url }
 * Renders the report to branded HTML, stores it, and returns a customer-facing
 * secure link (expiring, revocable) served at /api/runtime/share/<token>. */
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
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const report: any = await rt.reports.getReport(String(body.id));
  if (!report) return NextResponse.json({ error: "report not found" }, { status: 404 });
  try {
    const html = rt.reports.toHtml(report);
    const share = await rt.deliverables.shareInline({
      org_id: report.org_id, environment_id: report.environment_id,
      filename: `governance-report-${report.period}-${(report.generated_at || "").slice(0, 10)}.html`,
      bytes: Buffer.from(html, "utf8"), mime: "text/html; charset=utf-8",
      expires_in_days: body?.expires_in_days, password: body?.password || null,
    });
    await rt.adminaudit.record({ action: "share_report", actor: authz.identity, via: authz.via, target: report.org_id, meta: { period: report.period } });
    const origin = req.headers.get("origin") || `https://${req.headers.get("host") || "resurrection-tech.com"}`;
    return NextResponse.json({ ok: true, ...share, url: `${origin}${share.path}` });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed to share report" }, { status: 500 });
  }
}
