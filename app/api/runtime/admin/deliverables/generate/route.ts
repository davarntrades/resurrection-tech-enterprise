/** Runtime Governance — evidence-pack generation (four distinct report types).
 *
 *   report_type: "monthly_evidence" (default) — concise recurring operational
 *       report from live rg_decisions telemetry (HTML/MD/JSON + optional PDF).
 *   report_type: "executive_summary" — one-page editorial executive PDF.
 *   report_type: "full_audit" — the full 48-Hour Runtime Governance Audit,
 *       a MANIFEST assessment (live /v1/assess on the customer's stored
 *       manifest). Requires a manifest + the Railway renderer.
 *   report_type: "enterprise_assessment" — organisation-wide, multi-environment
 *       technical evidence for the 2–6 week Enterprise Assessment engagement.
 *       Requires at least one stored manifest + the Railway renderer.
 *
 * PDFs render on the dedicated Railway renderer (the only place Chromium runs in
 * production). Fails closed: no pack is created if rendering or upload fails.
 * Auth: operator session OR x-admin-key. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import { notifyCustomer } from "@/lib/customerNotify";
import { renderPdfs, rendererConfigured } from "@/lib/renderer";
import { buildExecutiveReportHtml } from "@/lib/reportHtml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(req: NextRequest) {
  return rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
}

type Upload = { filename: string; bytes: Buffer; mime: string };
const REPORT_TYPES = ["monthly_evidence", "executive_summary", "full_audit", "enterprise_assessment"] as const;
type ReportType = (typeof REPORT_TYPES)[number];
const PACK_NAME: Record<ReportType, string> = {
  monthly_evidence: "Monthly Governance Evidence",
  executive_summary: "Executive Summary",
  full_audit: "48-Hour Runtime Governance Audit",
  enterprise_assessment: "Enterprise Runtime Governance Assessment",
};

export async function POST(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const org_id = String(body?.org_id || "");
  const environment_id = String(body?.environment_id || "");
  if (!org_id || !environment_id) return NextResponse.json({ error: "org_id and environment_id required" }, { status: 400 });
  const report_type: ReportType = REPORT_TYPES.includes(body?.report_type) ? body.report_type : "monthly_evidence";
  const period = rt.reports.PERIODS.includes(body?.period) ? body.period : "monthly";

  // Ownership: the environment MUST belong to the org (blocks cross-org packs).
  const env: any = await rt.admin.getEnvironment(environment_id).catch(() => null);
  if (!env || env.org_id !== org_id) return NextResponse.json({ error: "environment does not belong to this organisation" }, { status: 403 });

  const origin = req.headers.get("origin") || `https://${req.headers.get("host") || "resurrection-tech.com"}`;
  const fail = async (stage: string, error: string, status = 502) => {
    await rt.adminaudit.record({ action: "generate_pack_failed", actor: authz.identity, via: authz.via, target: environment_id, meta: { org_id, report_type, stage, error } }).catch(() => {});
    return NextResponse.json({ error, stage, report_type }, { status });
  };

  try {
    let files: Upload[] = [];
    let notifyExec = false;

    if (report_type === "enterprise_assessment") {
      const avail = await rt.enterpriseassessment.availability(org_id);
      if (!avail.available) return NextResponse.json({ error: avail.reason, report_type, code: "no_manifest" }, { status: 409 });
      if (!rendererConfigured()) return fail("config", "PDF renderer required for the enterprise assessment (RENDERER_URL/RENDERER_SECRET unset)", 503);
      let built: any;
      try { built = await rt.enterpriseassessment.build({ org_id, requested_environment_id: environment_id }); }
      catch (e: any) {
        const code = e?.code;
        if (code === "no_manifest") return NextResponse.json({ error: e.message, report_type, code }, { status: 409 });
        if (code === "cross_org") return NextResponse.json({ error: e.message }, { status: 403 });
        return fail("assess", e?.message || "enterprise assessment failed");
      }
      let pdfs;
      try { pdfs = await renderPdfs([{ name: "enterprise-assessment.pdf", html: built.html }]); }
      catch (e: any) { return fail("render", `PDF rendering failed — no pack created: ${e?.message || e}`); }
      files = [
        { filename: "enterprise-assessment.pdf", bytes: pdfs[0].bytes, mime: "application/pdf" },
        { filename: "enterprise-assessment.html", bytes: Buffer.from(built.html, "utf8"), mime: "text/html; charset=utf-8" },
        { filename: "enterprise-assessment-model.json", bytes: Buffer.from(JSON.stringify(built.model, null, 2), "utf8"), mime: "application/json" },
      ];
      notifyExec = true;
    } else if (report_type === "full_audit") {
      // Gate: a stored manifest is mandatory (no synthesis from decisions).
      const avail = await rt.fullaudit.availability(org_id, environment_id);
      if (!avail.available) return NextResponse.json({ error: avail.reason, report_type, code: "no_manifest" }, { status: 409 });
      if (!rendererConfigured()) return fail("config", "PDF renderer required for the full audit (RENDERER_URL/RENDERER_SECRET unset)", 503);

      let built: any;
      try { built = await rt.fullaudit.build({ org_id, environment_id }); }
      catch (e: any) {
        const code = e?.code;
        if (code === "no_manifest") return NextResponse.json({ error: e.message, report_type, code }, { status: 409 });
        if (code === "cross_org") return NextResponse.json({ error: e.message }, { status: 403 });
        return fail("assess", e?.message || "assessment failed");
      }
      let pdfs;
      try { pdfs = await renderPdfs([{ name: "full-audit.pdf", html: built.html }]); }
      catch (e: any) { return fail("render", `PDF rendering failed — no pack created: ${e?.message || e}`); }
      files = [
        { filename: "full-audit.pdf", bytes: pdfs[0].bytes, mime: "application/pdf" },
        { filename: "full-audit.html", bytes: Buffer.from(built.html, "utf8"), mime: "text/html; charset=utf-8" },
        { filename: "full-audit-model.json", bytes: Buffer.from(JSON.stringify(built.model, null, 2), "utf8"), mime: "application/json" },
      ];
      notifyExec = true;
    } else if (report_type === "executive_summary") {
      if (!rendererConfigured()) return fail("config", "PDF renderer required for the executive summary (RENDERER_URL/RENDERER_SECRET unset)", 503);
      const report: any = await rt.reports.generate({ org_id, environment_id, period, ref: undefined });
      const org: any = await rt.admin.getOrg(org_id).catch(() => null);
      const execHtml = buildExecutiveReportHtml(report, rt.reports.summarize(report), org?.name);
      let pdfs;
      try { pdfs = await renderPdfs([{ name: "executive-report.pdf", html: execHtml }]); }
      catch (e: any) { return fail("render", `PDF rendering failed — no pack created: ${e?.message || e}`); }
      files = [
        { filename: "executive-report.pdf", bytes: pdfs[0].bytes, mime: "application/pdf" },
        { filename: "executive-report.html", bytes: Buffer.from(execHtml, "utf8"), mime: "text/html; charset=utf-8" },
        { filename: "run-summary.json", bytes: Buffer.from(JSON.stringify(report, null, 2), "utf8"), mime: "application/json" },
      ];
      notifyExec = true;
    } else {
      // monthly_evidence — concise recurring report from live telemetry.
      const report: any = await rt.reports.generate({ org_id, environment_id, period, ref: undefined });
      const html = rt.reports.toHtml(report);
      files = [
        { filename: "monthly-evidence.html", bytes: Buffer.from(html, "utf8"), mime: "text/html; charset=utf-8" },
        { filename: "monthly-evidence.md", bytes: Buffer.from(rt.reports.toMarkdown(report), "utf8"), mime: "text/markdown; charset=utf-8" },
        { filename: "run-summary.json", bytes: Buffer.from(JSON.stringify(report, null, 2), "utf8"), mime: "application/json" },
      ];
      if (rendererConfigured()) {
        try {
          const pdfs = await renderPdfs([{ name: "monthly-evidence.pdf", html }]);
          files.push({ filename: "monthly-evidence.pdf", bytes: pdfs[0].bytes, mime: "application/pdf" });
        } catch (e: any) { return fail("render", `PDF rendering failed — no pack created: ${e?.message || e}`); }
      }
    }

    let result: any;
    try { result = await rt.deliverables.publishUploaded({ org_id, environment_id, name: PACK_NAME[report_type], reference: null, files }); }
    catch (e: any) { return fail("publish", `evidence pack upload failed — no pack created: ${e?.message || e}`); }

    await rt.adminaudit.record({ action: "generate_evidence_pack", actor: authz.identity, via: authz.via, target: environment_id, meta: { pack_id: result.pack.id, report_type, period, files: result.deliverables.length } });

    const notified = await notifyCustomer({ org_id, event: "new_evidence", origin, context: { packName: result.pack.name } });
    if (notifyExec) await notifyCustomer({ org_id, event: "executive_report", origin, context: { packName: result.pack.name } });

    return NextResponse.json({ ok: true, report_type, pack_id: result.pack.id, deliverables: result.deliverables.length, customer_notified: !!notified.sent });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "generate failed" }, { status: 500 });
  }
}
