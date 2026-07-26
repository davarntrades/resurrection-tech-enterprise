import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import { environmentAllowed, integrationAuth } from "@/lib/integration-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate: any = await integrationAuth(req, "runtime:read");
  if (gate.response) return gate.response;
  const auth = gate.auth;
  const environments = (await rt.admin.listEnvironments(auth.org.id)).filter((e: any) => environmentAllowed(auth, e.id));
  const [allConnectors, allWebhooks, allDeployments] = await Promise.all([
    (rt.integrationGateway as any).listConnectors(auth.org.id),
    (rt.integrationGateway as any).listWebhooks(auth.org.id),
    (rt.integrationGateway as any).listDeployments(auth.org.id),
  ]);
  const connectors = allConnectors.filter((x: any) => environmentAllowed(auth, x.environment_id));
  const webhooks = allWebhooks.filter((x: any) => environmentAllowed(auth, x.environment_id));
  const deployments = allDeployments.filter((x: any) => environmentAllowed(auth, x.environment_id));
  return NextResponse.json({
    organisation: auth.org, environments, connectors, webhooks, deployments,
    integration_metrics: {
      connected_systems: connectors.length, webhooks: webhooks.length,
      sandbox_deployments: deployments.filter((d: any) => d.target === "sandbox").length,
      production_deployments: deployments.filter((d: any) => d.target === "production").length,
    },
  }, { headers: { "cache-control": "no-store" } });
}
