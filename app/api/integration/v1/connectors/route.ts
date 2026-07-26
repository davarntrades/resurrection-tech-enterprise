import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import { environmentAllowed, integrationAuth, proposalResponse } from "@/lib/integration-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate: any = await integrationAuth(req, "integrations:read");
  if (gate.response) return gate.response;
  const connectors = await (rt.integrationGateway as any).listConnectors(gate.auth.org.id);
  return NextResponse.json({
    definitions: (rt.integrationGateway as any).CONNECTOR_DEFINITIONS,
    connectors: connectors.filter((c: any) => environmentAllowed(gate.auth, c.environment_id)),
  });
}

export async function POST(req: NextRequest) {
  const gate: any = await integrationAuth(req, "integrations:manage");
  if (gate.response) return gate.response;
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON body required" }, { status: 400 }); }
  if (["enable", "disable", "check"].includes(body.operation)) {
    const row = await rt.store.findOne("integration_connectors", { id: body.connector_id });
    if (!row || row.org_id !== gate.auth.org.id || !environmentAllowed(gate.auth, row.environment_id))
      return NextResponse.json({ error: "connector not found" }, { status: 404 });
    const proposal = await (rt.integrationGateway as any).governed(body.operation === "check" ? "check_integration_connector" : "manage_integration_connector", {
      org_id: gate.auth.org.id, environment_id: row.environment_id, actor: `api-key:${gate.auth.key_id}`,
      params: { connector_id: row.id, ...(body.operation === "check" ? {} : { status: body.operation === "enable" ? "active" : "disabled" }) },
    });
    return proposalResponse(proposal);
  }
  if (!body.type || !body.environment_id) return NextResponse.json({ error: "type and environment_id are required" }, { status: 400 });
  if (!environmentAllowed(gate.auth, body.environment_id)) return NextResponse.json({ error: "credential is not authorised for this environment" }, { status: 403 });
  try {
    const secret_ref = body.secret ? await (rt.integrationGateway as any).stageSecret(gate.auth.org.id, body.secret, "connector") : null;
    const proposal = await (rt.integrationGateway as any).governed("configure_integration", {
      org_id: gate.auth.org.id, environment_id: body.environment_id, actor: `api-key:${gate.auth.key_id}`,
      params: { type: body.type, name: body.name, endpoint: body.endpoint, config: body.config || {}, secret_ref },
    });
    return proposalResponse(proposal);
  } catch (e: any) { return NextResponse.json({ error: e?.message || "connector configuration failed" }, { status: 400 }); }
}
