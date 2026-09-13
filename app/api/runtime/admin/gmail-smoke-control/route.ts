/** Operator control for real Gmail production-smoke delivery.
 * Defaults fail-closed to OFF. The connector itself remains independently
 * enabled/disabled through the Integration Gateway. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import gmailSmokeControl from "@/lib/runtime/gmail-smoke-control";

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
  const environment_id = new URL(req.url).searchParams.get("environment_id") || "";
  if (!environment_id) return NextResponse.json({ error: "environment_id required" }, { status: 400 });
  try {
    return NextResponse.json(await gmailSmokeControl.status(environment_id), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error: any) {
    return NextResponse.json({
      enabled: false,
      default: false,
      source: "control_unavailable",
      error: error?.message || "control unavailable",
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

export async function POST(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON body required" }, { status: 400 }); }
  const org_id = String(body.org_id || "");
  const connector_id = String(body.connector_id || "");
  if (!org_id || !connector_id || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "org_id, connector_id and boolean enabled are required" }, { status: 400 });
  }
  try {
    const control = await gmailSmokeControl.set({ org_id, connector_id, enabled: body.enabled });
    await rt.adminaudit.record({
      action: "set_gmail_production_smoke",
      actor: authz.identity,
      via: authz.via,
      target: connector_id,
      meta: { enabled: body.enabled, environment_id: control.environment_id },
    });
    return NextResponse.json({ ok: true, ...control });
  } catch (error: any) {
    const message = error?.message || "Gmail smoke control update failed";
    return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : 400 });
  }
}
