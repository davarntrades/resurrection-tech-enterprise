import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const runs = rt.enterpriseActionRuns as any;
const adapters = rt.enterpriseActionAdapters as any;

function operator(req: NextRequest) {
  return rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
}
function statusFor(error: any) {
  if (error?.code === "CONNECTOR_NOT_FOUND") return 404;
  if (["CONNECTOR_UNHEALTHY", "ENTERPRISE_ACTION_UNSUPPORTED", "ENTERPRISE_ADAPTER_UNSUPPORTED"].includes(error?.code)) return 409;
  return Number(error?.status) || 400;
}
async function scope(org_id: string, environment_id: string) {
  const org = await rt.admin.getOrg(org_id);
  if (!org) return "organisation not found";
  const environment = await rt.store.findOne("environments", { id: environment_id });
  if (!environment || environment.org_id !== org_id) return "environment not found";
  return null;
}
export async function GET(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  const url = new URL(req.url);
  const org_id = String(url.searchParams.get("org_id") || "");
  const environment_id = String(url.searchParams.get("environment_id") || "");
  const run_id = String(url.searchParams.get("enterprise_action_run_id") || "");
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  if (!(await rt.admin.getOrg(org_id))) return NextResponse.json({ error: "organisation not found" }, { status: 404 });
  try {
    const current = run_id ? await runs.advanceRun(run_id, org_id, rt.integrationGateway) : null;
    const rows = await rt.store.findOptional("integration_connectors", { org_id });
    const types = new Set(adapters.listAdapters().map((x: any) => x.connector_type));
    const connectors = rows.filter((row: any) => types.has(row.type)
      && row.status !== "disabled" && row.health === "healthy"
      && (!environment_id || row.environment_id === environment_id))
      .map((row: any) => ({
        id: row.id, name: row.name, type: row.type, environment_id: row.environment_id,
        health: row.health, status: row.status, config: row.config,
      }));
    return NextResponse.json({
      current, connectors, adapters: adapters.listAdapters(), actions: adapters.listActions(),
      dashboard: await runs.aggregate(org_id, environment_id || null),
      executions: await runs.recentRuns(org_id, environment_id || null, 50),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ code: error?.code || "ENTERPRISE_STATE_UNAVAILABLE", error: error?.message || "enterprise action state unavailable" }, { status: statusFor(error) });
  }
}
export async function POST(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON body required" }, { status: 400 }); }
  const org_id = String(body.org_id || "");
  const environment_id = String(body.environment_id || "");
  if (!org_id || !environment_id) return NextResponse.json({ error: "org_id and environment_id are required" }, { status: 400 });
  const scopeError = await scope(org_id, environment_id);
  if (scopeError) return NextResponse.json({ error: scopeError }, { status: 404 });
  try {
    const created = await runs.createRun({
      org_id, environment_id, connector_id: String(body.connector_id || ""),
      action_id: String(body.action_id || ""), source_type: body.source_type || "rest_api",
      source_external_id: body.source_external_id, input: body.input || {},
      idempotency_key: req.headers.get("idempotency-key") || body.idempotency_key,
      actor: op.identity,
    });
    return NextResponse.json(created, { status: 202, headers: { "cache-control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ code: error?.code || "ENTERPRISE_REQUEST_REJECTED", error: error?.message || "enterprise request rejected" }, { status: statusFor(error) });
  }
}
