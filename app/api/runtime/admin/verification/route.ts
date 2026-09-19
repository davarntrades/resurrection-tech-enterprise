/** Runtime Governance — finite-model verification surface (read-only).
 *
 * GET → four SEPARATE classes of evidence for this deployment:
 *       verification (what a finite-model enumeration established, inside its
 *       declared model), runtime governance (what the engine decided about
 *       real proposed actions), integrity/drift (whether the configuration
 *       running now is the one that was verified), and counterexamples.
 *
 * There is deliberately no aggregate status. Those are four different claims,
 * and none of them is a claim of universal safety.
 *
 * There is deliberately no POST/PUT/PATCH/DELETE either. Verification evidence
 * is produced by the verifier in CI and ingested out of band; a surface that
 * could write its own verification result would not be evidence of anything.
 *
 * Auth: operator session OR x-admin-key — the same gate as every admin route.
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
  if (!authz.ok) {
    return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  }
  const url = new URL(req.url);
  try {
    const status = await (rt as any).verification.status({
      org_id: url.searchParams.get("org_id") || undefined,
      environment_id: url.searchParams.get("environment_id") || undefined,
    });
    return NextResponse.json(status, { headers: { "cache-control": "private, no-store" } });
  } catch (e: any) {
    // This panel exists to remove guesswork, so its own failure must not read
    // as reassurance. A 200 with a partial body could render as "nothing to
    // report"; a 503 cannot.
    return NextResponse.json(
      { error: "verification status unavailable", detail: (e && e.message) || String(e) },
      { status: 503, headers: { "cache-control": "private, no-store" } },
    );
  }
}
