/** Operations Agent — trigger one agent cycle on demand (operator-only).
 *   POST → runs Observe → Reason → Propose → Governance → Execute → Evidence */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const authz = rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  const result = await (ops.agent as any).runCycle({ trigger: `operator:${authz.identity}` });
  await rt.adminaudit.record({ action: "ops_run_cycle", actor: authz.identity, via: authz.via, target: null, meta: { run_id: result.run_id } });
  return NextResponse.json(result);
}
