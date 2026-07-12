/** Operator manifest management for the Control Room.
 * POST { org_id, environment_id, manifest, domains?, note? }
 * Stores/version-controls the customer's manifest and runs /v1/assess.
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
  try { body = await req.json(); } catch { return NextResponse.json({ error: "valid JSON body required" }, { status: 400 }); }
  const org_id = String(body?.org_id || "");
  const environment_id = String(body?.environment_id || "");
  const manifest = body?.manifest;
  const tools = Array.isArray(manifest) ? manifest : null;
  if (!org_id || !environment_id) return NextResponse.json({ error: "org_id and environment_id required" }, { status: 400 });
  if (!tools || !tools.length) return NextResponse.json({ error: "manifest must contain at least one tool" }, { status: 400 });
  const names = rt.manifests.normalizeTools(tools);
  if (!names.length) return NextResponse.json({ error: "manifest contains no recognised tool names" }, { status: 400 });

  const domains = Array.isArray(body?.domains) ? body.domains.map((x: any) => String(x).trim()).filter(Boolean) : undefined;
  try {
    const result: any = await rt.manifests.putManifest({
      org_id, environment_id, manifest: tools, domains,
      note: body?.note ? String(body.note).slice(0, 500) : "Uploaded from Control Room",
      reassess: true,
    });
    await rt.adminaudit.record({
      action: "upload_manifest", actor: authz.identity, via: authz.via, target: environment_id,
      meta: { org_id, changed: !!result.changed, version: result.version?.version || null, tool_count: names.length, domains: domains || [] },
    });
    return NextResponse.json({ ok: true, changed: !!result.changed, version: result.version, diff: result.diff, tool_count: names.length });
  } catch (e: any) {
    const status = e?.code === "TENANT_MISMATCH" || e?.status === 403 ? 403 : 500;
    return NextResponse.json({ error: e?.message || "manifest upload failed" }, { status });
  }
}
