import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import { environmentAllowed, integrationAuth, proposalResponse } from "@/lib/integration-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const errorStatus = (code?: string) => {
  if (code === "GOVERNANCE_ESCALATED") return 202;
  if (code === "GOVERNANCE_UNAVAILABLE") return 503;
  if (code?.startsWith("GOVERNANCE_")) return 403;
  if (["AWS_INVALID_CREDENTIALS", "AWS_ACCESS_DENIED", "AWS_CREDENTIALS_EXPIRED"].includes(code || "")) return 401;
  if (["AWS_TIMEOUT", "AWS_SERVICE_UNAVAILABLE"].includes(code || "")) return 503;
  if (code?.startsWith("AWS_")) return 400;
  return 500;
};

function bedrockProposalResponse(proposal: any) {
  if ((rt.integrationGateway as any).executed(proposal)) return proposalResponse(proposal);
  if (proposal?.status === "failed") {
    const message = proposal?.execution?.error || "AWS credential operation failed";
    const match = String(message).match(/^(AWS_[A-Z_]+):\s*(.*)$/);
    const code = match?.[1] || "AWS_CREDENTIAL_VALIDATION_FAILED";
    return NextResponse.json({
      ok: false, code, error: match?.[2] || message,
      governance: { proposal_id: proposal?.id, evidence_id: proposal?.evidence_id, status: proposal?.status },
    }, { status: errorStatus(code) });
  }
  return proposalResponse(proposal);
}

export async function GET(req: NextRequest) {
  const gate: any = await integrationAuth(req, "integrations:read");
  if (gate.response) return gate.response;
  const all = await (rt.integrationGateway as any).bedrockOverview(gate.auth.org.id);
  const connectorId = new URL(req.url).searchParams.get("connector_id");
  const connectors = all.filter((c: any) =>
    environmentAllowed(gate.auth, c.environment_id) && (!connectorId || c.id === connectorId));
  if (connectorId && !connectors.length) return NextResponse.json({ error: "Bedrock connector not found" }, { status: 404 });
  return NextResponse.json({ connectors }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  let body: any = {};
  try { body = JSON.parse(rawBody); }
  catch { return NextResponse.json({ code: "AWS_MALFORMED_PAYLOAD", error: "JSON body required" }, { status: 400 }); }

  const operation = String(body.operation || "invoke");
  const requiredScope = ["rotate_credentials", "validate"].includes(operation) ? "integrations:manage" : "runtime:write";
  const gate: any = await integrationAuth(req, requiredScope);
  if (gate.response) return gate.response;
  if (!body.connector_id || !body.environment_id)
    return NextResponse.json({ error: "connector_id and environment_id are required" }, { status: 400 });
  if (!environmentAllowed(gate.auth, body.environment_id))
    return NextResponse.json({ error: "credential is not authorised for this environment" }, { status: 403 });

  const row = await rt.store.findOne("integration_connectors", { id: body.connector_id });
  if (!row || row.org_id !== gate.auth.org.id || row.environment_id !== body.environment_id || row.type !== "aws-bedrock")
    return NextResponse.json({ error: "Bedrock connector not found" }, { status: 404 });

  const actor = `api-key:${gate.auth.key_id}`;
  try {
    if (operation === "rotate_credentials") {
      if (!body.credentials) return NextResponse.json({ error: "replacement credentials are required" }, { status: 400 });
      const secret_ref = await (rt.integrationGateway as any).stageSecret(
        gate.auth.org.id, body.credentials, "aws-bedrock-credential-rotation");
      const proposal = await (rt.integrationGateway as any).governed("rotate_aws_bedrock_credentials", {
        org_id: gate.auth.org.id, environment_id: body.environment_id, actor,
        params: { connector_id: row.id, config: body.config || {}, secret_ref },
      });
      return bedrockProposalResponse(proposal);
    }
    if (operation === "validate") {
      const proposal = await (rt.integrationGateway as any).governed("check_integration_connector", {
        org_id: gate.auth.org.id, environment_id: body.environment_id, actor,
        params: { connector_id: row.id },
      });
      return bedrockProposalResponse(proposal);
    }
    if (operation === "action_group") {
      const result = await (rt.integrationGateway as any).handleBedrockActionGroup({
        org_id: gate.auth.org.id, environment_id: body.environment_id, connector_id: row.id,
        event: body.event, raw_body: rawBody,
        signature: {
          timestamp: req.headers.get("x-guardian-aws-timestamp"),
          nonce: req.headers.get("x-guardian-aws-nonce"),
          signature: req.headers.get("x-guardian-aws-signature"),
        },
        actor, key_id: gate.auth.key_id, sdk: req.headers.get("x-guardian-sdk"),
      });
      return NextResponse.json(result.response ? { ...result, bedrock_response: result.response } : result, { status: result.ok ? 200 : errorStatus(result.code) });
    }
    if (operation !== "invoke") return NextResponse.json({ error: "unsupported Bedrock operation" }, { status: 400 });
    const result = await (rt.integrationGateway as any).invokeBedrock({
      org_id: gate.auth.org.id, environment_id: body.environment_id, connector_id: row.id,
      request: body.request || {}, actor, key_id: gate.auth.key_id, sdk: req.headers.get("x-guardian-sdk"),
    });
    return NextResponse.json(result, { status: result.ok ? 200 : errorStatus(result.code) });
  } catch (e: any) {
    return NextResponse.json({ code: e?.code || "AWS_BEDROCK_ERROR", error: e?.message || "Amazon Bedrock operation failed" }, { status: errorStatus(e?.code) });
  }
}
