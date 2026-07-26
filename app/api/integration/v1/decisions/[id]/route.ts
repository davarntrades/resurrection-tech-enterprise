import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import { environmentAllowed, integrationAuth } from "@/lib/integration-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate: any = await integrationAuth(req, "runtime:read");
  if (gate.response) return gate.response;
  const { id } = await ctx.params;
  const decision = await rt.store.getDecisionById(id);
  if (!decision || decision.org_id !== gate.auth.org.id || !environmentAllowed(gate.auth, decision.environment_id))
    return NextResponse.json({ error: "decision not found" }, { status: 404 });
  return NextResponse.json({ decision });
}
