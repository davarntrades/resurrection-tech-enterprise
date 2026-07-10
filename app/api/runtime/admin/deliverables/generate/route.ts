/** Runtime Governance — one-click evidence pack (no Chromium).
 * Generates a governance report from live evidence, renders it to HTML/Markdown
 * + a run-summary JSON, and publishes them as a pack under the environment.
 * (The full branded 48-Hour Audit — Ω exposure map, trajectory replay, branded
 * PDFs — is produced by the console/CLI and uploaded via /deliverables/publish.)
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

export async function POST(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const org_id = String(body?.org_id || "");
  const environment_id = String(body?.environment_id || "");
  if (!org_id || !environment_id) return NextResponse.json({ error: "org_id and environment_id required" }, { status: 400 });
  const period = rt.reports.PERIODS.includes(body?.period) ? body.period : "monthly";

  try {
    const report: any = await rt.reports.generate({ org_id, environment_id, period, ref: undefined });
    const files = [
      { filename: "audit.html", bytes: Buffer.from(rt.reports.toHtml(report), "utf8"), mime: "text/html; charset=utf-8" },
      { filename: "audit.md", bytes: Buffer.from(rt.reports.toMarkdown(report), "utf8"), mime: "text/markdown; charset=utf-8" },
      { filename: "run-summary.json", bytes: Buffer.from(JSON.stringify(report, null, 2), "utf8"), mime: "application/json" },
    ];
    const result = await rt.deliverables.publishUploaded({ org_id, environment_id, name: "Runtime Evidence Pack", reference: null, files });
    await rt.adminaudit.record({ action: "generate_evidence_pack", actor: authz.identity, via: authz.via, target: environment_id, meta: { pack_id: result.pack.id, period } });
    return NextResponse.json({ ok: true, pack_id: result.pack.id, deliverables: result.deliverables.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "generate failed" }, { status: 500 });
  }
}
