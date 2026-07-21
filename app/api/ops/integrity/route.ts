/** Operations Agent — Coordination Integrity (read-only observation aid).
 *   GET [?days=7]  → reconciles every handoff against its linked governed
 *     proposal, evidence, governance verdict and the admin audit trail, and
 *     returns a green/red report with named anomalies. Use it to validate the
 *     Coordination Spine in production before enabling OPS_COORDINATION.
 *     (operator session/admin key, or client key with `status` scope)
 *   Inspects records only — proposes nothing, executes nothing, mutates nothing. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const op = rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
  if (!op.ok) {
    const key = req.headers.get("x-ops-client-key") || "";
    const client = await (ops.clients as any).authenticate(key, { requireScope: "status" });
    if (!client.ok) return NextResponse.json({ error: "operator or client authentication required" }, { status: 401 });
  }
  const daysRaw = Number(new URL(req.url).searchParams.get("days"));
  const sinceDays = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(90, daysRaw) : 7;
  return NextResponse.json(await (ops.integrity as any).check({ sinceDays }));
}
