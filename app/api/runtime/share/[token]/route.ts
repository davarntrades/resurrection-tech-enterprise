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
  return new NextResponse(new Uint8Array(r.bytes as Buffer), {
    status: 200,
    headers: {
      "content-type": del.mime || "application/octet-stream",
      "content-disposition": `inline; filename="${del.filename}"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
