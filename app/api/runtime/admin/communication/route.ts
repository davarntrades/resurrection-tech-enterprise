import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const runs = rt.communicationRuns as any;
const adapters = rt.communicationAdapters as any;

function operator(req: NextRequest) {
  return rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
}

function statusFor(error: any) {
  if (error?.code === "CONNECTOR_NOT_FOUND") return 404;
  if (["CONNECTOR_UNHEALTHY", "COMMUNICATION_ACTION_UNSUPPORTED", "COMMUNICATION_ADAPTER_UNSUPPORTED", "COMMUNICATION_THREAD_REQUIRED"].includes(error?.code)) return 409;
  return 400;
}

async function eligibleConnectors(org_id: string, environment_id: string | null) {
  const rows = await rt.store.findOptional("integration_connectors", { org_id });
  const types = new Set(adapters.listAdapters().map((item: any) => item.connector_type));
  return rows
    .filter((row: any) => types.has(row.type) && row.status !== "disabled" && row.health === "healthy"
      && (!environment_id || row.environment_id === environment_id))
    .map((row: any) => ({
      id: row.id, name: row.name, type: row.type, environment_id: row.environment_id,
      health: row.health, status: row.status,
      mailbox: row.config?.mailbox || null,
      allowed_recipient_domains: row.config?.allowed_recipient_domains || [],
    }));
}

export async function GET(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  const url = new URL(req.url);
  const org_id = String(url.searchParams.get("org_id") || "");
  const environment_id = String(url.searchParams.get("environment_id") || "");
  const communication_run_id = String(url.searchParams.get("communication_run_id") || "");
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  const org = await rt.admin.getOrg(org_id);
  if (!org) return NextResponse.json({ error: "organisation not found" }, { status: 404 });

  try {
    // Advancing here is what drives an escalated run forward once an operator
    // has approved it. It is idempotent and can never cause a second send.
    let current = null;
    if (communication_run_id) current = await runs.advanceRun(communication_run_id, org_id, rt.integrationGateway);
    const executions = await runs.recentRuns(org_id, environment_id || null, 50);
    return NextResponse.json({
      current,
      connectors: await eligibleConnectors(org_id, environment_id || null),
      adapters: adapters.listAdapters(),
      actions: adapters.listActions(),
      dashboard: await runs.aggregate(org_id, environment_id || null),
      executions,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ code: error?.code || "COMMUNICATION_STATE_UNAVAILABLE", error: error?.message || "communication state unavailable" }, { status: statusFor(error) });
  }
}

export async function POST(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON body required" }, { status: 400 }); }

  const org_id = String(body.org_id || "");
  const environment_id = String(body.environment_id || "");
  if (!org_id || !environment_id) return NextResponse.json({ error: "org_id and environment_id are required" }, { status: 400 });
  const org = await rt.admin.getOrg(org_id);
  if (!org) return NextResponse.json({ error: "organisation not found" }, { status: 404 });
  const environment = await rt.store.findOne("environments", { id: environment_id });
  if (!environment || environment.org_id !== org_id) return NextResponse.json({ error: "environment not found" }, { status: 404 });

  try {
    const created = await runs.createRun({
      org_id,
      environment_id,
      connector_id: String(body.connector_id || ""),
      action_id: String(body.action_id || ""),
      source_type: body.source_type || "rest_api",
      source_external_id: body.source_external_id,
      message: body.message || {},
      idempotency_key: req.headers.get("idempotency-key") || body.idempotency_key,
      actor: op.identity,
    });
    return NextResponse.json(created, { status: 202, headers: { "cache-control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ code: error?.code || "COMMUNICATION_REQUEST_REJECTED", error: error?.message || "communication request rejected" }, { status: statusFor(error) });
  }
}
