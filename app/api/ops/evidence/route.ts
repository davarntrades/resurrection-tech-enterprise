/** Operations Agent — decision evidence (operator-only, searchable).
 *   GET ?org_id=&verdict=&action_id=&since=&limit= → evidence rows + summary */
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
  const url = new URL(req.url);
  const E: any = ops.evidence;
  const filter = {
    org_id: url.searchParams.get("org_id") || undefined,
    verdict: url.searchParams.get("verdict") || undefined,
    action_id: url.searchParams.get("action_id") || undefined,
    since: url.searchParams.get("since") || undefined,
    limit: Number(url.searchParams.get("limit") || 100),
  };
  const [evidence, summary] = await Promise.all([E.search(filter), E.summary({ org_id: filter.org_id })]);
  return NextResponse.json({ evidence, summary });
}
