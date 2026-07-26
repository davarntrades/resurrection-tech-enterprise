import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import { environmentAllowed, integrationAuth } from "@/lib/integration-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate: any = await integrationAuth(req, "runtime:read");
  if (gate.response) return gate.response;
  const sandbox = (await rt.admin.listEnvironments(gate.auth.org.id))
    .find((e: any) => e.kind === "sandbox" && environmentAllowed(gate.auth, e.id));
  if (!sandbox) return NextResponse.json({ error: "no sandbox environment is available to this credential" }, { status: 404 });
  return NextResponse.json({
    sandbox: {
      ...sandbox,
      simulation: "real Runtime Governance in shadow mode",
      note: "The sandbox uses the production decision authority with non-enforcing outcomes; no parallel or mock policy engine is created.",
    },
    sample_policies: [
      { domain: "finance", purpose: "Block unauthorised fund movement and escalate ambiguous transfers." },
      { domain: "data_privacy", purpose: "Block credential sharing and sensitive-data egress." },
      { domain: "enterprise", purpose: "Require governed authority for privileged deployment actions." },
    ],
    example_request: {
      method: "POST", path: "/api/runtime/evaluate",
      body: { trajectory: [{ tool: "read_account", args: {} }], domains: ["finance"], label: "sandbox-quickstart" },
    },
    example_integrations: [
      { type: "rest", endpoint: "/api/runtime/evaluate" },
      { type: "webhook", event: "decision.created", signature: "HMAC-SHA256" },
      { type: "github", use_case: "Govern repository automation before privileged actions execute." },
      { type: "aws-bedrock", use_case: "Govern Bedrock Runtime requests and Agent action groups before AWS execution." },
    ],
    sdk_examples: {
      typescript: "await guardian.evaluate({ trajectory: [{ tool: 'read_account', args: {} }], domains: ['finance'] })",
      python: "guardian.evaluate([{'tool': 'read_account', 'args': {}}], ['finance'])",
      bedrock_typescript: "await guardian.integrations.bedrock.invokeModel({ connector_id, environment_id, request: { model_id, messages } })",
      bedrock_python: "guardian.integrations.bedrock.invoke_model(connector_id, environment_id, {'model_id': model_id, 'messages': messages})",
    },
  });
}
