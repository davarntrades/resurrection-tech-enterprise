/**
 * Operator Control Room — deployment profile orchestration.
 *
 * This route never changes Morrison policy/kernel semantics. It persists profile
 * intent, runs the shared backend readiness engine and only activates
 * Production/Sovereign after that engine returns READY.
 */
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

function safeConfig(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const allowed = new Set([
    "sovereign_profile", "customer_environment_ref", "secret_store_ref",
    "customer_secret_store", "evidence_store_ref", "governance_engine_location",
    "local_engine", "provider_endpoint_refs", "approved_egress", "rollback_path_ref",
    "audit_export_ref", "notes",
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!allowed.has(key)) continue;
    // This surface stores references/configuration only. Raw credentials belong
    // in the customer-controlled secret store and must never land here.
    if (/secret|token|password|credential/i.test(key) && !/(ref|store)/i.test(key)) continue;
    out[key] = value;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  const [orgs, environments, profiles, resources] = await Promise.all([
    rt.store.find("orgs", {}),
    rt.store.find("environments", {}),
    rt.store.findOptional("deployment_profiles", {}),
    rt.store.findOptional("runtime_resources", {}),
  ]);
  return NextResponse.json({
    definitions: rt.deploymentProfiles.DEFINITIONS,
    sovereign_defaults: rt.deploymentProfiles.SOVEREIGN_DEFAULTS,
    orgs,
    environments,
    profiles,
    resources,
  });
}

export async function POST(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "preflight");
  const org_id = String(body.org_id || "");
  const environment_id = String(body.environment_id || "");
  const profile = String(body.profile || "");
  if (!org_id || !environment_id || !profile) return NextResponse.json({ error: "org_id, environment_id and profile are required" }, { status: 400 });
  const config = safeConfig(body.config);
  const actor = authz.actor || "control_room";

  try {
    if (action === "draft") {
      const saved = await rt.deploymentProfiles.saveDraft({ org_id, environment_id, profile, config, actor });
      return NextResponse.json({ ok: true, profile: saved });
    }
    if (action === "preflight") {
      await rt.deploymentProfiles.saveDraft({ org_id, environment_id, profile, config, actor });
      const result = await rt.deploymentProfiles.preflight({ org_id, environment_id, profile, config });
      return NextResponse.json({ ok: result.ready, readiness: result }, { status: result.ready ? 200 : 409 });
    }
    if (action === "activate") {
      const result = await rt.deploymentProfiles.activate({ org_id, environment_id, profile, config, actor });
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json({ error: "action must be draft, preflight or activate" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({
      error: error?.message || "deployment operation failed",
      code: error?.code || "DEPLOYMENT_OPERATION_FAILED",
      readiness: error?.readiness || null,
    }, { status: error?.code === "DEPLOYMENT_PREFLIGHT_FAILED" ? 409 : 400 });
  }
}
