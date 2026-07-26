import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import { environmentAllowed, integrationAuth, proposalResponse } from "@/lib/integration-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate: any = await integrationAuth(req, "evidence:read");
  if (gate.response) return gate.response;
  const limit = Math.min(500, Number(new URL(req.url).searchParams.get("limit") || 100));
  const [decisions, events] = await Promise.all([
    rt.store.queryDecisions({ org_id: gate.auth.org.id, environment_id: gate.auth.environment?.id || undefined, limit }),
    rt.store.findOptional("integration_events", { org_id: gate.auth.org.id }),
  ]);
  return NextResponse.json({ decisions, integration_evidence: events.filter((e: any) => environmentAllowed(gate.auth, e.environment_id)).slice(-limit).reverse() });
}

export async function POST(req: NextRequest) {
  const gate: any = await integrationAuth(req, "evidence:write");
  if (gate.response) return gate.response;
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON body required" }, { status: 400 }); }
  if (!body.environment_id || !body.evidence) return NextResponse.json({ error: "environment_id and evidence are required" }, { status: 400 });
  if (!environmentAllowed(gate.auth, body.environment_id)) return NextResponse.json({ error: "credential is not authorised for this environment" }, { status: 403 });
  try {
    const proposal = await (rt.integrationGateway as any).governed("submit_integration_evidence", {
      org_id: gate.auth.org.id, environment_id: body.environment_id, actor: `api-key:${gate.auth.key_id}`,
      params: { type: body.type || "customer.evidence", evidence: body.evidence },
    });
    return proposalResponse(proposal);
  } catch (e: any) { return NextResponse.json({ error: e?.message || "evidence submission failed" }, { status: 400 }); }
}
