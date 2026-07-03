/** Runtime Governance — dashboard metrics (counters, latency, rule + Ω
 * frequency). Read-only; any active API key for the org may read. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bearer = (req: NextRequest) => (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();

export async function GET(req: NextRequest) {
  const auth = await rt.admin.authenticate(bearer(req));
  if (!auth) return NextResponse.json({ error: "valid API key required" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const all = searchParams.get("all");
  const summary = await rt.metrics.summary({
    org_id: auth.org.id,
    environment_id: all ? undefined : (auth.environment ? auth.environment.id : undefined),
    since: searchParams.get("since") || undefined,
    until: searchParams.get("until") || undefined,
  });
  return NextResponse.json(summary);
}
