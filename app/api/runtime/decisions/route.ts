/** Runtime Governance — searchable decision history + evidence export.
 * GET ?verdict&omega_domain&rule&q&since&until&limit&format=csv&all */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bearer = (req: NextRequest) => (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();

export async function GET(req: NextRequest) {
  const auth = await rt.admin.authenticate(bearer(req));
  if (!auth) return NextResponse.json({ error: "valid API key required" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const environment_id = sp.get("all") ? undefined : (auth.environment ? auth.environment.id : undefined);
  const filter = {
    org_id: auth.org.id, environment_id,
    verdict: sp.get("verdict") || undefined, omega_domain: sp.get("omega_domain") || undefined,
    rule: sp.get("rule") || undefined, q: sp.get("q") || undefined,
    since: sp.get("since") || undefined, until: sp.get("until") || undefined,
    limit: Number(sp.get("limit") || 200),
  };
  if (sp.get("format") === "csv") {
    const out = await rt.metrics.exportDecisions({ ...filter, format: "csv" });
    return new NextResponse(out.body, { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="runtime-evidence.csv"` } });
  }
  return NextResponse.json(await rt.store.queryDecisions(filter));
}
