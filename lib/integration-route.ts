import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export function bearer(req: NextRequest): string {
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

export async function integrationAuth(req: NextRequest, scope: string) {
  const auth: any = await rt.admin.authenticate(bearer(req));
  if (!auth) return { response: NextResponse.json({ error: "valid GuardianOS API credential required" }, { status: 401 }) };
  if (!(rt.integrationGateway as any).allows(auth, scope))
    return { response: NextResponse.json({ error: `credential scope ${scope} required` }, { status: 403 }) };
  await (rt.integrationGateway as any).recordUsage({
    org_id: auth.org.id, environment_id: auth.environment?.id || null, key_id: auth.key_id,
    operation: scope, sdk: req.headers.get("x-guardian-sdk") || null,
  }).catch(() => { /* usage telemetry must never break governed traffic */ });
  return { auth };
}

export function proposalResponse(proposal: any, extra: Record<string, unknown> = {}) {
  if ((rt.integrationGateway as any).executed(proposal))
    return NextResponse.json({ ok: true, governance: { proposal_id: proposal.id, evidence_id: proposal.evidence_id, status: proposal.status }, result: proposal.execution?.result || null, ...extra });
  const status = proposal?.status === "escalated" ? 202 : 403;
  return NextResponse.json({
    ok: false,
    governance: { proposal_id: proposal?.id, evidence_id: proposal?.evidence_id, status: proposal?.status },
    error: proposal?.status === "escalated" ? "operation awaits governed approval" : proposal?.decision?.reason || "operation blocked by Runtime Governance",
  }, { status });
}

export function environmentAllowed(auth: any, environmentId: string) {
  return (rt.integrationGateway as any).allowsEnvironment(auth, environmentId);
}
