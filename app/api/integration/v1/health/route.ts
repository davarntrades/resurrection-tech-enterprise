import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import { environmentAllowed, integrationAuth } from "@/lib/integration-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate: any = await integrationAuth(req, "integrations:read");
  if (gate.response) return gate.response;
  const [engine, allConnectors, allWebhooks, allDeployments] = await Promise.all([
    rt.engine.health(),
    (rt.integrationGateway as any).listConnectors(gate.auth.org.id),
    (rt.integrationGateway as any).listWebhooks(gate.auth.org.id),
    (rt.integrationGateway as any).listDeployments(gate.auth.org.id),
  ]);
  const connectors = allConnectors.filter((x: any) => environmentAllowed(gate.auth, x.environment_id));
  const webhooks = allWebhooks.filter((x: any) => environmentAllowed(gate.auth, x.environment_id));
  const deployments = allDeployments.filter((x: any) => environmentAllowed(gate.auth, x.environment_id));
  return NextResponse.json({
    status: engine.ok ? "ok" : "degraded",
    runtime: { reachable: !!engine.ok, error: engine.ok ? null : engine.error || `HTTP ${engine.status}` },
    integrations: {
      connected_systems: connectors.length,
      healthy: connectors.filter((c: any) => c.health === "healthy").length,
      degraded: connectors.filter((c: any) => ["degraded", "down"].includes(c.health)).length,
      webhooks: webhooks.length, deployments: deployments.length,
    },
  }, { headers: { "cache-control": "no-store" } });
}
