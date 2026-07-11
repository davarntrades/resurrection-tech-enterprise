/** Runtime Governance — Evidence Hub management (operator-authed).
 *   GET  ?org_id=                      → the org's active hub link (or null)
 *   POST { org_id }                    → create (or reuse) the hub link
 *   POST { org_id, rotate:true }       → revoke the old link + mint a new one
 *   POST { org_id, email }             → create/reuse + email the durable link
 *   POST { revoke:<token> }            → revoke a hub link
 * The hub page + files are served credential-free at /evidence/hub/<token>. */
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

export async function GET(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  const org_id = new URL(req.url).searchParams.get("org_id") || "";
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  const h = await rt.hub.hubForOrg(org_id);
  return NextResponse.json({ hub: h ? { token: h.token, path: `/evidence/hub/${h.token}`, url: `${originOf(req)}/evidence/hub/${h.token}`, created_at: h.created_at, accessed: h.accessed || 0 } : null });
}

export async function POST(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (body?.revoke) {
    const ok = await rt.hub.revokeHub(String(body.revoke));
    await rt.adminaudit.record({ action: "revoke_hub", actor: authz.identity, via: authz.via, meta: { token: String(body.revoke) } });
    return NextResponse.json({ ok });
  }

  const org_id = String(body?.org_id || "");
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  try {
    const hub = body?.rotate ? await rt.hub.rotateHub(org_id) : await rt.hub.createHub({ org_id });
    await rt.adminaudit.record({ action: body?.rotate ? "rotate_hub" : "create_hub", actor: authz.identity, via: authz.via, target: org_id, meta: { token: hub.token } });
    const url = `${originOf(req)}${hub.path}`;

    let emailed_to: string | null = null;
    let email_error: string | null = null;
    const to = String(body?.email || "").trim();
    if (to) {
      if (!isEmail(to)) {
        email_error = "invalid recipient email — hub created but not sent";
      } else {
        const orgName = (await rt.admin.getOrg(org_id))?.name || null;
        const sent = await sendSecureShareEmail({ to, url, filename: "Runtime Governance evidence hub", orgName, note: "Your ongoing Runtime Governance evidence — bookmark this single secure link." });
        await rt.adminaudit.record({ action: "email_hub", actor: authz.identity, via: authz.via, target: hub.token, meta: { to, ok: sent.ok } });
        if (sent.ok) emailed_to = to; else email_error = sent.error || "email failed";
      }
    }
    return NextResponse.json({ ok: true, token: hub.token, path: hub.path, url, reused: !!hub.reused, emailed_to, email_error });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed to create hub" }, { status: 500 });
  }
}
