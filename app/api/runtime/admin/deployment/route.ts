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
    "customer_secret_store", "evidence_store_ref", "provider_endpoint_refs",
    "approved_egress", "rollback_path_ref", "audit_export_ref", "notes",
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!allowed.has(key)) continue;
    if (/secret|token|password|credential/i.test(key) && !/(ref|store)/i.test(key)) continue;
    out[key] = value;
  }
  return out;
}

const RESOURCE_CLASSES = new Set(["CANARY", "STAGING", "PRODUCTION", "SOVEREIGN"]);
const BLAST_RADII = new Set(["inert", "contained", "limited", "production", "sovereign", "unknown"]);
const clean = (value: unknown, max = 240) => String(value ?? "").trim().slice(0, max);

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
    resource_classes: [...RESOURCE_CLASSES],
    blast_radii: [...BLAST_RADII],
    orgs, environments, profiles, resources,
  });
}

export async function POST(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "preflight");
  const actor = authz.identity || "control_room";

  try {
    // Resource classification is an explicit privileged Control Room path. The
    // client supplies only an environment id; org_id is always derived from the
    // server-read environment so an arbitrary body parameter cannot retarget a
    // resource into another tenant.
    if (action === "resource_upsert") {
      const environment_id = clean(body.environment_id, 160);
      if (!environment_id) return NextResponse.json({ error: "environment_id is required" }, { status: 400 });
      const env = await rt.store.findOne("environments", { id: environment_id });
      if (!env) return NextResponse.json({ error: "environment not found" }, { status: 404 });

      const resource_type = clean(body.resource_type, 80);
      const resource_ref = clean(body.resource_ref, 500);
      const classification = clean(body.classification, 40).toUpperCase();
      const blast_radius = clean(body.blast_radius, 40).toLowerCase();
      if (!resource_type || !resource_ref) return NextResponse.json({ error: "resource_type and resource_ref are required" }, { status: 400 });
      if (!RESOURCE_CLASSES.has(classification)) return NextResponse.json({ error: "invalid resource classification" }, { status: 400 });
      if (!BLAST_RADII.has(blast_radius)) return NextResponse.json({ error: "invalid blast-radius classification" }, { status: 400 });

      const existing = clean(body.resource_id, 180)
        ? await rt.store.findOneOptional("runtime_resources", { id: clean(body.resource_id, 180) })
        : null;
      if (existing && (existing.org_id !== env.org_id || existing.environment_id !== env.id)) {
        return NextResponse.json({ error: "resource does not belong to selected environment" }, { status: 404 });
      }
      const patch = {
        org_id: env.org_id,
        environment_id: env.id,
        resource_type,
        resource_ref,
        classification,
        blast_radius,
        metadata: { ...(existing?.metadata || {}), classified_by: actor, classified_at: rt.store.nowISO() },
        updated_at: rt.store.nowISO(),
      };
      let resource;
      if (existing) {
        await rt.store.update("runtime_resources", existing.id, patch);
        resource = await rt.store.findOne("runtime_resources", { id: existing.id });
      } else {
        resource = await rt.store.insert("runtime_resources", patch);
      }
      await rt.adminaudit.record({ action: "classify_runtime_resource", actor, via: authz.via || "control-room", target: env.org_id, meta: { environment_id: env.id, resource_id: resource.id, classification, blast_radius } });
      return NextResponse.json({ ok: true, resource });
    }

    const org_id = clean(body.org_id, 160);
    const environment_id = clean(body.environment_id, 160);
    const profile = clean(body.profile, 80);
    if (!org_id || !environment_id || !profile) return NextResponse.json({ error: "org_id, environment_id and profile are required" }, { status: 400 });
    const config = safeConfig(body.config);

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
    return NextResponse.json({ error: "unsupported deployment action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({
      error: error?.message || "deployment operation failed",
      code: error?.code || "DEPLOYMENT_OPERATION_FAILED",
      readiness: error?.readiness || null,
    }, { status: error?.code === "DEPLOYMENT_PREFLIGHT_FAILED" ? 409 : 400 });
  }
}
