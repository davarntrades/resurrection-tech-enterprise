/** Runtime Governance — operator overview: platform KPIs + customers with
 * summary badges. Operator-authed (session OR x-admin-key). Read-only. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(req: NextRequest) {
  return rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
}

export async function GET(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  try {
    const [platform, customers] = await Promise.all([rt.overview.platform(), rt.overview.customers()]);
    return NextResponse.json({ platform, customers });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed to load overview" }, { status: 500 });
  }
}
