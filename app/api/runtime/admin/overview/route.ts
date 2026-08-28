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
  const startedAt = performance.now();
  try {
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") || "all";
    if (!new Set(["all", "platform", "customers"]).has(scope))
      return NextResponse.json({ error: "scope must be all, platform or customers" }, { status: 400 });
    const includeEngine = !["0", "false", "deferred"].includes(url.searchParams.get("engine") || "");
    // Scoped reads prevent Overview from computing every customer lifecycle,
    // and prevent Customers from waiting on the Railway engine health probe.
    const platformPromise = scope === "customers" ? Promise.resolve(null) : rt.overview.platform({ include_engine_health: includeEngine });
    const customersPromise = scope === "platform" ? Promise.resolve(null) : rt.overview.customers();
    const [platform, customers] = await Promise.all([platformPromise, customersPromise]);
    // Never cache: Refresh must always reflect current live telemetry + packs.
    return NextResponse.json({ ...(platform ? { platform } : {}), ...(customers ? { customers } : {}) }, {
      headers: {
        "cache-control": "no-store, max-age=0",
        "server-timing": `overview;dur=${(performance.now() - startedAt).toFixed(1)};desc=\"${scope}\"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed to load overview" }, { status: 500 });
  }
}
