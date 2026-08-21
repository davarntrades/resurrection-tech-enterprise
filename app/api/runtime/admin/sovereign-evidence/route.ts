/** Sovereign engagement evidence generation.
 *
 * Additive wrapper around the existing engagement/report/audit machinery.
 * It NEVER changes Morrison verdict, Ω, reachability or execution semantics.
 * Standard engagements continue to use the existing deliverables generator.
 */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import { notifyCustomer } from "@/lib/customerNotify";
import { renderPdfs, rendererConfigured } from "@/lib/renderer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Upload = { filename: string; bytes: Buffer; mime: string };
type Action = "monthly" | "audit" | "pilot" | "closeout";

function authorize(req: NextRequest) {
  return rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
}

function esc(v: unknown) {
  return String(v ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" }[c] || c));
}

function annexModel(engagement: any, currentDeployment: any, env: any) {
  return {
    schema: "guardian.sovereign-engagement-evidence/v1",
    generated_at: new Date().toISOString(),
    engagement: {
      org_id: engagement.org_id,
      stage: engagement.stage,
      stage_label: engagement.stage_label,
      deployment_mode: engagement.deployment_mode,
      target_profile: engagement.sovereign_profile,
      target_profile_label: engagement.sovereign_profile_label,
      cadence: engagement.cadence,
    },
    assurance_scope: {
      features: engagement.features || [],
      required_evidence: engagement.sovereign_requirements || [],
      monthly_sovereign_evidence: true,
      governance_semantics_changed: false,
    },
    target_environment: {
      id: env.id,
      kind: env.kind,
      mode: env.mode,
    },
    current_control_plane_deployment: currentDeployment,
    claim_boundary: "Target sovereign requirements are engagement acceptance criteria. They are not asserted as satisfied unless independently evidenced by the target deployment. Morrison governance semantics are unchanged.",
  };
}

function annexHtml(m: any) {
  const requirements = (m.assurance_scope.required_evidence || []).map((x: string) => `<li>${esc(x)}</li>`).join("");
  const features = (m.assurance_scope.features || []).map((x: string) => `<li>${esc(x)}</li>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Sovereign Assurance Annex</title>
  <style>body{font-family:system-ui,-apple-system,sans-serif;max-width:920px;margin:48px auto;padding:0 28px;color:#111}h1{font-size:30px}h2{margin-top:32px}code{background:#f3f3f3;padding:2px 5px;border-radius:4px}.boundary{border:1px solid #999;padding:16px;margin-top:28px}li{margin:8px 0}</style></head><body>
  <p>RESURRECTION TECH · GUARDIAN OS SOVEREIGN</p><h1>Sovereign Assurance Annex</h1>
  <p><b>Engagement:</b> ${esc(m.engagement.stage_label)} · <b>Target profile:</b> ${esc(m.engagement.target_profile_label)}</p>
  <p><b>Evidence cadence:</b> monthly sovereign evidence + standard engagement evidence</p>
  <h2>Included capability</h2><ul>${features}</ul>
  <h2>Sovereign acceptance evidence</h2><ul>${requirements}</ul>
  <h2>Target environment</h2><p><code>${esc(m.target_environment.id)}</code> · ${esc(m.target_environment.kind)} · ${esc(m.target_environment.mode)}</p>
  <h2>Current control-plane deployment observed by this generator</h2><pre>${esc(JSON.stringify(m.current_control_plane_deployment, null, 2))}</pre>
  <div class="boundary"><b>Claim boundary</b><p>${esc(m.claim_boundary)}</p></div>
  </body></html>`;
}

export async function POST(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const org_id = String(body.org_id || "");
  const environment_id = String(body.environment_id || "");
  const action: Action = ["monthly", "audit", "pilot", "closeout"].includes(body.action) ? body.action : "monthly";
  if (!org_id || !environment_id) return NextResponse.json({ error: "org_id and environment_id required" }, { status: 400 });

  const engagement: any = await rt.engagement.get(org_id);
  if (!engagement?.sovereign) {
    return NextResponse.json({ error: "sovereign mode is not enabled for this engagement", code: "SOVEREIGN_MODE_OFF" }, { status: 409 });
  }
  const env: any = await rt.admin.getEnvironment(environment_id).catch(() => null);
  if (!env || env.org_id !== org_id) return NextResponse.json({ error: "environment does not belong to this organisation" }, { status: 403 });

  let currentDeployment: any = null;
  try { currentDeployment = rt.sovereign.deployment.deploymentPolicy(); }
  catch (e: any) { currentDeployment = { status: "unknown", error: e?.message || String(e) }; }

  const annex = annexModel(engagement, currentDeployment, env);
  const annexHtmlText = annexHtml(annex);
  const files: Upload[] = [
    { filename: "sovereign-assurance-annex.json", bytes: Buffer.from(JSON.stringify(annex, null, 2)), mime: "application/json" },
    { filename: "sovereign-assurance-annex.html", bytes: Buffer.from(annexHtmlText), mime: "text/html; charset=utf-8" },
  ];

  let packName = "Sovereign Monthly Governance Evidence";
  try {
    if (action === "audit") {
      const avail = await rt.fullaudit.availability(org_id, environment_id);
      if (!avail.available) return NextResponse.json({ error: avail.reason, code: "no_manifest" }, { status: 409 });
      if (!rendererConfigured()) return NextResponse.json({ error: "PDF renderer required for sovereign audit" }, { status: 503 });
      const built: any = await rt.fullaudit.build({ org_id, environment_id });
      const pdfs = await renderPdfs([
        { name: "sovereign-runtime-governance-audit.pdf", html: built.html },
        { name: "sovereign-assurance-annex.pdf", html: annexHtmlText },
      ]);
      files.push(
        { filename: "sovereign-runtime-governance-audit.pdf", bytes: pdfs[0].bytes, mime: "application/pdf" },
        { filename: "sovereign-assurance-annex.pdf", bytes: pdfs[1].bytes, mime: "application/pdf" },
        { filename: "full-audit.html", bytes: Buffer.from(built.html), mime: "text/html; charset=utf-8" },
        { filename: "full-audit-model.json", bytes: Buffer.from(JSON.stringify(built.model, null, 2)), mime: "application/json" },
      );
      packName = "Sovereign 48-Hour Runtime Governance Audit";
    } else {
      const report: any = await rt.reports.generate({ org_id, environment_id, period: "monthly", ref: undefined });
      const html = rt.reports.toHtml(report);
      files.push(
        { filename: "monthly-evidence.html", bytes: Buffer.from(html), mime: "text/html; charset=utf-8" },
        { filename: "monthly-evidence.md", bytes: Buffer.from(rt.reports.toMarkdown(report)), mime: "text/markdown; charset=utf-8" },
        { filename: "run-summary.json", bytes: Buffer.from(JSON.stringify(report, null, 2)), mime: "application/json" },
      );
      if (rendererConfigured()) {
        const pdfs = await renderPdfs([
          { name: "monthly-evidence.pdf", html },
          { name: "sovereign-assurance-annex.pdf", html: annexHtmlText },
        ]);
        files.push(
          { filename: "monthly-evidence.pdf", bytes: pdfs[0].bytes, mime: "application/pdf" },
          { filename: "sovereign-assurance-annex.pdf", bytes: pdfs[1].bytes, mime: "application/pdf" },
        );
      }
      if (action === "pilot") packName = "Sovereign Limited Pilot Evidence";
      if (action === "closeout") packName = "Sovereign Engagement Closeout Evidence";
    }

    const result: any = await rt.deliverables.publishUploaded({ org_id, environment_id, name: packName, reference: null, files });
    await rt.adminaudit.record({
      action: "generate_sovereign_evidence_pack", actor: authz.identity, via: authz.via, target: environment_id,
      meta: { org_id, engagement_stage: engagement.stage, sovereign_profile: engagement.sovereign_profile, action, pack_id: result.pack.id, files: result.deliverables.length },
    });
    const origin = req.headers.get("origin") || `https://${req.headers.get("host") || "resurrection-tech.com"}`;
    const notified = await notifyCustomer({ org_id, event: "new_evidence", origin, context: { packName } });
    return NextResponse.json({ ok: true, action, pack_id: result.pack.id, pack_name: packName, deliverables: result.deliverables.length, customer_notified: !!notified.sent });
  } catch (e: any) {
    await rt.adminaudit.record({ action: "generate_sovereign_evidence_failed", actor: authz.identity, via: authz.via, target: environment_id, meta: { org_id, action, error: e?.message || String(e) } }).catch(() => {});
    return NextResponse.json({ error: e?.message || "sovereign evidence generation failed" }, { status: 500 });
  }
}
