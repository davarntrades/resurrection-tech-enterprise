/** Runtime Governance — operator action audit log (who onboarded / enforced /
 * rotated a key, and when). GET ?limit=… Auth: operator session OR x-admin-key. */
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
  const limit = Number(new URL(req.url).searchParams.get("limit")) || 100;
  return NextResponse.json({ actions: await rt.adminaudit.list({ limit }) });
}
