/** Runtime Governance — download a report as Markdown / HTML / JSON.
 *   GET ?id=<report_id>&format=md|html|json
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
  const id = sp.get("id") || "";
  const format = (sp.get("format") || "md").toLowerCase();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const report: any = await rt.reports.getReport(id);
  if (!report) return NextResponse.json({ error: "report not found" }, { status: 404 });

  const base = `governance-report-${report.period}-${(report.generated_at || "").slice(0, 10)}`;
  let body: string, mime: string, ext: string;
  if (format === "json") { body = JSON.stringify(report, null, 2); mime = "application/json"; ext = "json"; }
  else if (format === "html") { body = rt.reports.toHtml(report); mime = "text/html; charset=utf-8"; ext = "html"; }
  else { body = rt.reports.toMarkdown(report); mime = "text/markdown; charset=utf-8"; ext = "md"; }

  return new NextResponse(body, {
    status: 200,
    headers: { "content-type": mime, "content-disposition": `attachment; filename="${base}.${ext}"`, "cache-control": "private, no-store" },
  });
}
