/** Runtime Governance — secure delivery link (customer-facing, credential-free).
 * Serves a shared deliverable if the token is active (not expired / revoked) and
 * the password (if any) matches. The console, engine, and admin API are never
 * exposed here — only the one finished deliverable the operator chose to share.
 *   GET /api/runtime/share/<token>[?pw=<password>]
 */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const pw = new URL(req.url).searchParams.get("pw") || req.headers.get("x-share-password") || "";
  const r = await rt.deliverables.resolveShare(token, pw);
  if (!r.ok) {
    const msg = r.error === "expired" ? "This link has expired."
      : r.error === "revoked" ? "This link has been revoked."
      : r.error === "password required" ? "A password is required for this link."
      : "Link not found.";
    return NextResponse.json({ error: msg }, { status: r.status });
  }
  const del: any = r.deliverable;
  const bytes = r.bytes as Buffer;
  // Serve with Content-Length + Range so iPad/iOS Safari renders the shared PDF
  // inline (its viewer sends a Range request and rejects a length-less 200).
  const plan = rt.deliverables.planByteResponse({
    size: bytes.length, mime: del.mime, filename: del.filename, mode: "preview",
    range: req.headers.get("range"),
  });
  const headers = { ...plan.headers, "x-robots-tag": "noindex, nofollow" };
  if (plan.status === 416) return new NextResponse(null, { status: 416, headers });
  const slice = bytes.subarray(plan.start, plan.end + 1);
  return new NextResponse(new Uint8Array(slice), { status: plan.status, headers });
}
