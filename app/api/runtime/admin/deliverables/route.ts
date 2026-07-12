/** Runtime Governance — audit deliverables for a customer environment.
 *   GET ?org_id=&environment_id=  → audit packs + their deliverables + shares
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
  const sp = new URL(req.url).searchParams;
  const org_id = sp.get("org_id") || undefined;
  const environment_id = sp.get("environment_id") || undefined;
  try {
    const [packs, shares, full_audit] = await Promise.all([
      rt.deliverables.listPacks({ org_id, environment_id }),
      rt.deliverables.listShares({ org_id }),
      // Full-audit availability gates the "Generate full audit" button — it needs
      // a stored customer manifest for the live /v1/assess.
      org_id && environment_id ? rt.fullaudit.availability(org_id, environment_id).catch(() => ({ available: false, reason: "manifest lookup failed" })) : Promise.resolve({ available: false, reason: "environment required" }),
    ]);
    return NextResponse.json({ packs, shares, full_audit });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed to list deliverables" }, { status: 500 });
  }
}
