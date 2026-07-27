import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const workflow = rt.customerSupportWorkflow as any;
const invocationRuns = rt.bedrockInvocationRuns as any;

function operator(req: NextRequest) {
  return rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
}

function statusFor(error: any) {
  if (error?.code === "CONNECTOR_NOT_FOUND") return 404;
  if (["AWS_MODEL_NOT_ALLOWED", "WORKFLOW_VALIDATION_ERROR"].includes(error?.code)) return 409;
  return 400;
}

export async function GET(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  const url = new URL(req.url);
  const org_id = String(url.searchParams.get("org_id") || "");
  const environment_id = String(url.searchParams.get("environment_id") || "");
  const workflow_run_id = String(url.searchParams.get("workflow_run_id") || "");
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  const org = await rt.admin.getOrg(org_id);
  if (!org) return NextResponse.json({ error: "organisation not found" }, { status: 404 });

  try {
    let current = null;
    if (workflow_run_id) current = await workflow.advanceExecution(workflow_run_id, org_id, rt.integrationGateway);
    const executions = await workflow.recentExecutions(org_id, environment_id || null, 50);
    const evidence = await workflow.recentEvidence(org_id, environment_id || null, 20);
    const connectors = await invocationRuns.listEligibleConnectors(org_id, environment_id || null);
    return NextResponse.json({
      workflow: workflow.WORKFLOW,
      current,
      connectors,
      dashboard: workflow.dashboard(executions),
      executions,
      evidence,
      source_types: [...workflow.SOURCE_TYPES],
      categories: [...workflow.CATEGORIES],
      priorities: [...workflow.PRIORITIES],
    }, { headers: { "cache-control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ code: error?.code || "WORKFLOW_STATE_UNAVAILABLE", error: error?.message || "workflow state unavailable" }, { status: statusFor(error) });
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
    const created = await workflow.createExecution({
      ...body,
      org_id,
      environment_id,
      source_type: body.source_type || "form",
      idempotency_key: req.headers.get("idempotency-key") || body.idempotency_key,
      actor: op.identity,
    });
    return NextResponse.json(created, { status: 202, headers: { "cache-control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ code: error?.code || "WORKFLOW_REQUEST_REJECTED", error: error?.message || "workflow request rejected" }, { status: statusFor(error) });
  }
}