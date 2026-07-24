/** Operations Agent — Executive Command: performance metrics (Phase 4).
 *   GET → deterministic, read-only performance report: per-agent proposal
 *         outcomes + verification pass rate + handoff throughput, council-level
 *         run throughput, and the current autonomy state. Oversight, not
 *         authority — nothing here can change a verdict or an action.
 *     (operator session/admin key, or client key with `status` scope — read-only) */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function operator(req: NextRequest) {
  return rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
}

export async function GET(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) {
    const key = req.headers.get("x-ops-client-key") || "";
    const client = await (ops.clients as any).authenticate(key, { requireScope: "status" });
    if (!client.ok) return NextResponse.json({ error: "operator or client authentication required" }, { status: 401 });
  }
  const report = await (ops.performance as any).report();
  return NextResponse.json(report);
}
