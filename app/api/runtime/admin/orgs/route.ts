/** Runtime Governance — list organisations (optionally with environments).
 *   GET ?withEnvironments=1 → each org includes its environments (id/kind/mode).
 * Auth: operator session OR x-admin-key. */
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
    const withEnv = ["1", "true", "yes"].includes(new URL(req.url).searchParams.get("withEnvironments") || "");
    const orgs = await rt.admin.listOrgs();
    if (!withEnv) return NextResponse.json({ orgs });
    const enriched = await Promise.all(orgs.map(async (o: any) => ({ ...o, environments: await rt.admin.listEnvironments(o.id) })));
    return NextResponse.json({ orgs: enriched });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed to list orgs" }, { status: 500 });
  }
}
