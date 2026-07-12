/** Runtime Governance — one-click evidence pack.
 * Generates a governance report from live evidence and publishes it as a pack.
 * When the Railway PDF renderer is configured (RENDERER_URL / RENDERER_SECRET),
 * it also renders branded audit.pdf + executive-report.pdf via the dedicated
 * renderer service (the only place Chromium runs in production) and FAILS CLOSED
 * — no pack is created if rendering or upload fails. Without a renderer it keeps
 * the legacy HTML/Markdown/JSON pack (no regression).
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

export async function POST(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const org_id = String(body?.org_id || "");
  const environment_id = String(body?.environment_id || "");
  if (!org_id || !environment_id) return NextResponse.json({ error: "org_id and environment_id required" }, { status: 400 });
  const period = rt.reports.PERIODS.includes(body?.period) ? body.period : "monthly";

  // Ownership: the environment MUST belong to the org — prevents an operator (or
  // a tampered request) from generating a pack across organisations.
  const env: any = await rt.admin.getEnvironment(environment_id).catch(() => null);
  if (!env || env.org_id !== org_id) return NextResponse.json({ error: "environment does not belong to this organisation" }, { status: 403 });

  try {
    const report: any = await rt.reports.generate({ org_id, environment_id, period, ref: undefined });
    const auditHtml = rt.reports.toHtml(report);

    // Base deliverables (always) — the legacy HTML/MD/JSON pack.
    const files: Upload[] = [
      { filename: "audit.html", bytes: Buffer.from(auditHtml, "utf8"), mime: "text/html; charset=utf-8" },
      { filename: "audit.md", bytes: Buffer.from(rt.reports.toMarkdown(report), "utf8"), mime: "text/markdown; charset=utf-8" },
      { filename: "run-summary.json", bytes: Buffer.from(JSON.stringify(report, null, 2), "utf8"), mime: "application/json" },
    ];

    // Branded PDFs via the Railway renderer, when configured. Fail closed.
    let rendered = false;
    if (rendererConfigured()) {
      const org: any = await rt.admin.getOrg(org_id).catch(() => null);
      const summary = rt.reports.summarize(report);
      const execHtml = buildExecutiveReportHtml(report, summary, org?.name);
      try {
        const pdfs = await renderPdfs([
          { name: "audit.pdf", html: auditHtml },
          { name: "executive-report.pdf", html: execHtml },
        ]);
        for (const p of pdfs) files.push({ filename: p.name, bytes: p.bytes, mime: "application/pdf" });
        files.push({ filename: "executive-report.html", bytes: Buffer.from(execHtml, "utf8"), mime: "text/html; charset=utf-8" });
        rendered = true;
      } catch (e: any) {
        // FAIL CLOSED — do not publish a pack when PDF rendering fails.
        await rt.adminaudit.record({ action: "generate_evidence_pack_failed", actor: authz.identity, via: authz.via, target: environment_id, meta: { org_id, stage: "render", error: e?.message || String(e) } }).catch(() => {});
        return NextResponse.json({ error: `PDF rendering failed — no pack created: ${e?.message || e}`, stage: "render" }, { status: 502 });
      }
    }

    let result: any;
    try {
      result = await rt.deliverables.publishUploaded({ org_id, environment_id, name: "Runtime Evidence Pack", reference: null, files });
    } catch (e: any) {
      // FAIL CLOSED — upload/persist failure must not report success.
      await rt.adminaudit.record({ action: "generate_evidence_pack_failed", actor: authz.identity, via: authz.via, target: environment_id, meta: { org_id, stage: "publish", rendered, error: e?.message || String(e) } }).catch(() => {});
      return NextResponse.json({ error: `evidence pack upload failed — no pack created: ${e?.message || e}`, stage: "publish" }, { status: 502 });
    }

    const hasExec = (result.deliverables || []).some((d: any) => /executive-report\.(pdf|html)$/i.test(d.filename || ""));
    await rt.adminaudit.record({ action: "generate_evidence_pack", actor: authz.identity, via: authz.via, target: environment_id, meta: { pack_id: result.pack.id, period, rendered, files: result.deliverables.length } });

    // Managed-service: notify opted-in customers.
    const origin = req.headers.get("origin") || `https://${req.headers.get("host") || "resurrection-tech.com"}`;
    const notified = await notifyCustomer({ org_id, event: "new_evidence", origin, context: { packName: result.pack.name } });
    if (hasExec) await notifyCustomer({ org_id, event: "executive_report", origin, context: { packName: result.pack.name } });

    return NextResponse.json({ ok: true, pack_id: result.pack.id, deliverables: result.deliverables.length, rendered, customer_notified: !!notified.sent });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "generate failed" }, { status: 500 });
  }
}
