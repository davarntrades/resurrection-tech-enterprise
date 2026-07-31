/** Runtime Governance — secure delivery link (customer-facing, credential-free).
 * Serves a shared deliverable if the token is active (not expired / revoked) and
 * the password (if any) matches. The console, engine, and admin API are never
 * exposed here — only the one finished deliverable the operator chose to share.
 *   GET /api/runtime/share/<token>          (x-share-password header if protected)
 *
 * The password is NOT read from the query string. It exists to protect a link
 * whose URL has leaked — a forwarded email, browser history, a proxy or CDN log.
 * Carrying it in that same URL would leak it by exactly the route it defends
 * against, so it must travel in a header instead.
 */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const pw = req.headers.get("x-share-password") || "";
  // A link that still carries ?pw= is already compromised: the secret is in the
  // URL. Refuse it explicitly rather than honouring it, so the operator learns
  // the link needs re-issuing instead of the weakness persisting silently.
  if (new URL(req.url).searchParams.has("pw")) {
    return NextResponse.json({
      error: "This link carries its password in the URL, which exposes it wherever the URL is logged or forwarded. Send the password in the x-share-password header, and ask the sender to re-issue the link.",
    }, { status: 400 });
  }
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
