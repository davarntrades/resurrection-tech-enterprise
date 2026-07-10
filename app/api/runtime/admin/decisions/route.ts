/** Runtime Governance — operator decision search (the MSSP query surface).
 *   GET ?org_id=&environment_id=&verdict=&omega_domain=&rule=&since=&until=&q=&limit=&format=csv
 * e.g. "every BLOCK event for Customer A over the last month". Operator-authed
 * (session OR x-admin-key) — distinct from /api/runtime/decisions (customer key). */
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

const csvCell = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const org_id = sp.get("org_id") || "";
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  const filter = {
    org_id,
    environment_id: sp.get("environment_id") || undefined,
    verdict: sp.get("verdict") || undefined,
    omega_domain: sp.get("omega_domain") || undefined,
    rule: sp.get("rule") || undefined,
    since: sp.get("since") || undefined,
    until: sp.get("until") || undefined,
    q: sp.get("q") || undefined,
    limit: Math.min(Number(sp.get("limit")) || 200, 5000),
  };

  try {
    const rows = await rt.store.queryDecisions(filter);
    if (sp.get("format") === "csv") {
      const cols = ["created_at", "verdict", "engine_verdict", "omega_domain", "rule", "environment_kind", "mode", "engine_compute_ms", "decision_id", "correlation_id"];
      const header = cols.join(",");
      const lines = rows.map((r: any) => cols.map((c) => csvCell(c === "decision_id" ? r.id : r[c])).join(","));
      return new NextResponse([header, ...lines].join("\n"), {
        status: 200,
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="decisions-${org_id}.csv"`, "cache-control": "private, no-store" },
      });
    }
    return NextResponse.json({ count: rows.length, decisions: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "decision search failed" }, { status: 500 });
  }
}
