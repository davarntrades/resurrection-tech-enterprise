/** Runtime Governance — recommendations tracker (operator-authed).
 *   GET  ?org_id= [&status=]                          → the org's recommendations + summary
 *   POST { org_id, title, detail?, severity?, source? }→ create a recommendation
 *   POST { id, status }                               → transition status
 *   POST { id, title?/detail?/severity?/status? }      → update fields
 * Recommendations are operator-managed; customers view them read-only in the
 * Evidence Hub and delivered reports. Operator-only surface (Control Room). */
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
  const url = new URL(req.url);
  const org_id = url.searchParams.get("org_id") || "";
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  const status = url.searchParams.get("status") || undefined;
  const R: any = rt.recommendations;
  const [items, summary] = await Promise.all([
    R.list({ org_id, status }),
    R.summary(org_id),
  ]);
  return NextResponse.json({ recommendations: items, summary, statuses: R.STATUSES, severities: R.SEVERITIES });
}

export async function POST(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }

  const R: any = rt.recommendations;
  try {
    // Update / status transition on an existing recommendation.
    if (body?.id) {
      const patch: any = {};
      for (const k of ["title", "detail", "severity", "status", "source"]) if (body[k] != null) patch[k] = body[k];
      const rec: any = await R.update(String(body.id), patch);
      await rt.adminaudit.record({ action: "update_recommendation", actor: authz.identity, via: authz.via, target: rec?.org_id || null, meta: { id: body.id, status: rec?.status } });
      return NextResponse.json({ ok: true, recommendation: rec });
    }
    // Create.
    const org_id = String(body?.org_id || "");
    if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
    const rec: any = await R.create({
      org_id,
      title: String(body?.title || ""),
      detail: String(body?.detail || ""),
      severity: body?.severity,
      environment_id: body?.environment_id || null,
      source: body?.source || null,
    });
    await rt.adminaudit.record({ action: "create_recommendation", actor: authz.identity, via: authz.via, target: org_id, meta: { id: rec.id, severity: rec.severity } });
    return NextResponse.json({ ok: true, recommendation: rec });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "recommendation write failed" }, { status: 400 });
  }
}
