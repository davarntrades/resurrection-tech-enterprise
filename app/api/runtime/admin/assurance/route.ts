/** Runtime Governance — Runtime Assurance Status (read-only).
 *
 * GET  → the state of the platform's assurance controls in THIS deployment:
 *        the two fail-closed environment switches, append-only trigger
 *        enforcement read from database metadata, evidence-hash verification,
 *        and the latest report's integrity result.
 *
 * There is deliberately no POST/PUT/PATCH/DELETE. Every control reported here
 * is configured outside the application — environment variables set in the
 * deployment, and migrations applied to the database. A governance control that
 * the governed system can switch off from its own admin UI is not a control,
 * so this endpoint can only observe.
 *
 * Returns booleans and derived states only; no environment variable VALUE and
 * no evidence content crosses this boundary.
 *
 * Auth: operator session OR x-admin-key — same gate as every other admin route.
 */
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
    const status = await rt.assurance.status();
    return NextResponse.json(status, { headers: { "cache-control": "private, no-store" } });
  } catch (e: any) {
    // The panel exists to remove guesswork, so its own failure must not read as
    // reassurance. A 200 with a partial body could be rendered as "no problems
    // reported"; a 503 cannot.
    return NextResponse.json(
      { error: "assurance status unavailable", detail: (e && e.message) || String(e) },
      { status: 503, headers: { "cache-control": "private, no-store" } },
    );
  }
}
