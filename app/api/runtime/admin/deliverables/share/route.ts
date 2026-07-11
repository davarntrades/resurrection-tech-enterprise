/** Runtime Governance — secure delivery links for a deliverable (operator-authed).
 *   POST { deliverable_id, expires_in_days?, password? } → create a share link
 *   POST { revoke: <token> }                             → revoke a link
 *   GET  ?org_id=&deliverable_id=                        → list shares
 * The link itself is served credential-free at /api/runtime/share/<token>. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import { sendSecureShareEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(req: NextRequest) {
  return rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
}

const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const originOf = (req: NextRequest) =>
  req.headers.get("origin") || `https://${req.headers.get("host") || "resurrection-tech.com"}`;

// Email an existing active share link to a customer contact. The link itself is
// unchanged (credential-free, expiring, revocable); this only delivers it.
async function emailShareLink(req: NextRequest, token: string, to: string) {
  const meta: any = await rt.deliverables.getShareMeta(token);
  if (!meta) return { status: 404, body: { error: "share not found" } };
  if (meta.state !== "active") return { status: 409, body: { error: `share is ${meta.state}` } };
  const orgName = meta.org_id ? (await rt.admin.getOrg(meta.org_id))?.name : null;
  const sent = await sendSecureShareEmail({
    to, url: `${originOf(req)}${meta.path}`, filename: meta.filename, orgName, expiresAt: meta.expires_at,
  });
  return sent.ok
    ? { status: 200, body: { ok: true, emailed_to: to } }
    : { status: 502, body: { error: sent.error || "email failed" } };
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

  // Deliver an existing secure link to a customer contact (no new token minted).
  if (body?.email_share) {
    const to = String(body.email || "").trim();
    if (!isEmail(to)) return NextResponse.json({ error: "a valid recipient email is required" }, { status: 400 });
    const res = await emailShareLink(req, String(body.email_share), to);
    await rt.adminaudit.record({ action: "email_share", actor: authz.identity, via: authz.via, target: String(body.email_share), meta: { to, ok: res.status === 200 } });
    return NextResponse.json(res.body, { status: res.status });
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
    const url = `${originOf(req)}${share.path}`;

    // Optionally deliver the link straight to a customer contact (managed
    // service). The link is created regardless — email is best-effort so a
    // send failure never loses the link.
    let emailed_to: string | null = null;
    let email_error: string | null = null;
    const to = String(body.email || "").trim();
    if (to) {
      if (!isEmail(to)) {
        email_error = "invalid recipient email — link created but not sent";
      } else {
        const orgName = share.org_id ? (await rt.admin.getOrg(share.org_id))?.name : null;
        const sent = await sendSecureShareEmail({ to, url, filename: share.filename, orgName, expiresAt: share.expires_at });
        await rt.adminaudit.record({ action: "email_share", actor: authz.identity, via: authz.via, target: share.token, meta: { to, ok: sent.ok } });
        if (sent.ok) emailed_to = to; else email_error = sent.error || "email failed";
      }
    }
    return NextResponse.json({ ok: true, ...share, url, emailed_to, email_error });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed to create share" }, { status: 500 });
  }
}
