/** Runtime Governance — secure delivery links for a deliverable (operator-authed).
 *   POST { deliverable_id, expires_in_days?, password? } → create a share link
 *   POST { revoke: <token> }                             → revoke a link
 *   GET  ?org_id=&deliverable_id=                        → list shares
 * The link itself is served credential-free at /api/runtime/share/<token>. */
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
  return NextResponse.json({ shares: await rt.deliverables.listShares({ org_id: sp.get("org_id") || undefined, deliverable_id: sp.get("deliverable_id") || undefined }) });
}

export async function POST(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (body?.revoke) {
    const ok = await rt.deliverables.revokeShare(String(body.revoke));
    await rt.adminaudit.record({ action: "revoke_share", actor: authz.identity, via: authz.via, meta: { token: String(body.revoke) } });
    return NextResponse.json({ ok });
  }

  if (!body?.deliverable_id) return NextResponse.json({ error: "deliverable_id required" }, { status: 400 });
  try {
    const share = await rt.deliverables.createShare({
      deliverable_id: String(body.deliverable_id),
      expires_in_days: body?.expires_in_days,
      password: body?.password || null,
    });
    await rt.adminaudit.record({ action: "share_deliverable", actor: authz.identity, via: authz.via, target: String(body.deliverable_id), meta: { expires_at: share.expires_at, protected: !!body?.password } });
    // Absolute URL for convenience (operator can copy/send directly).
    const origin = req.headers.get("origin") || `https://${req.headers.get("host") || "resurrection-tech.com"}`;
    return NextResponse.json({ ok: true, ...share, url: `${origin}${share.path}` });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed to create share" }, { status: 500 });
  }
}
