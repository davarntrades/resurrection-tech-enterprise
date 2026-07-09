/** Runtime Governance — operator-scoped evidence for a tenant environment.
 *   GET ?org_id=…&environment_id=…[&limit=]
 * Returns the metrics summary + recent decisions for ANY org/environment (the
 * dashboard evidence view). Operator-authed (session cookie OR x-admin-key) —
 * distinct from /api/runtime/metrics, which is scoped to a customer API key. */
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
  const org_id = sp.get("org_id") || "";
  const environment_id = sp.get("environment_id") || undefined; // omit → all envs for the org
  const limit = Math.min(Number(sp.get("limit")) || 25, 200);
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  // Time window (default all-time). "24h" | "7d" | "30d" → current + previous
  // period so the KPI cards can show a trend delta vs the prior equal window.
  const WINDOWS: Record<string, number> = { "24h": 86400000, "7d": 604800000, "30d": 2592000000 };
  const window = sp.get("window") || "";
  const span = WINDOWS[window];

  try {
    if (!span) {
      const [summary, recent] = await Promise.all([
        rt.metrics.summary({ org_id, environment_id }),
        rt.store.queryDecisions({ org_id, environment_id, limit }),
      ]);
      return NextResponse.json({ window: "all", summary, previous: null, recent });
    }
    const now = Date.now();
    const curSince = new Date(now - span).toISOString();
    const prevSince = new Date(now - 2 * span).toISOString();
    const [summary, previous, recent] = await Promise.all([
      rt.metrics.summary({ org_id, environment_id, since: curSince }),
      rt.metrics.summary({ org_id, environment_id, since: prevSince, until: curSince }),
      rt.store.queryDecisions({ org_id, environment_id, since: curSince, limit }),
    ]);
    return NextResponse.json({ window, summary, previous, recent });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed to load evidence" }, { status: 500 });
  }
}
