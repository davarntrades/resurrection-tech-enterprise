/** Operations Agent — action catalog (operator-only). The registered set of
 * privileged actions the agent may propose, with risk levels + Ω tool names. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authz = rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  const A: any = ops.actions;
  return NextResponse.json({ actions: A.list(), risks: A.RISKS, auto_execute_risks: A.AUTO_EXECUTE_RISKS });
}
