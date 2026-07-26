import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import { environmentAllowed, integrationAuth, proposalResponse } from "@/lib/integration-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate: any = await integrationAuth(req, "deployments:read");
  if (gate.response) return gate.response;
  const deployments = await (rt.integrationGateway as any).listDeployments(gate.auth.org.id);
  return NextResponse.json({ deployments: deployments.filter((d: any) => environmentAllowed(gate.auth, d.environment_id)) });
}

export async function POST(req: NextRequest) {
  const gate: any = await integrationAuth(req, "deployments:manage");
  if (gate.response) return gate.response;
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON body required" }, { status: 400 }); }
  if (!body.environment_id) return NextResponse.json({ error: "environment_id required" }, { status: 400 });
  if (!environmentAllowed(gate.auth, body.environment_id)) return NextResponse.json({ error: "credential is not authorised for this environment" }, { status: 403 });
  try {
    const proposal = await (rt.integrationGateway as any).governed("create_integration_deployment", {
      org_id: gate.auth.org.id, environment_id: body.environment_id, actor: `api-key:${gate.auth.key_id}`,
      params: { name: body.name, target: body.target, model: body.model, version: body.version },
    });
    return proposalResponse(proposal);
  } catch (e: any) { return NextResponse.json({ error: e?.message || "deployment creation failed" }, { status: 400 }); }
}
