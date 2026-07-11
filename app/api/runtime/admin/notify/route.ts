/** Runtime Governance — customer notification preferences (operator-authed).
 *   GET  ?org_id=                                  → the org's prefs (opt-in state)
 *   POST { org_id, enabled?, recipients?, events? } → upsert preferences
 *   POST { org_id, test:true }                     → send a test to the recipients
 *   POST { org_id, significant_event:true, message }→ send a significant-event alert
 * Customer notifications are opt-in and delivered by secure email only — there is
 * no customer login. Operator-only surface (Control Room). */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import { notifyCustomer } from "@/lib/customerNotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(req: NextRequest) {
  return rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
}
const originOf = (req: NextRequest) =>
  req.headers.get("origin") || `https://${req.headers.get("host") || "resurrection-tech.com"}`;

export async function GET(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  const org_id = new URL(req.url).searchParams.get("org_id") || "";
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  return NextResponse.json({ prefs: await rt.notify.getPrefs(org_id), events: rt.notify.EVENTS });
}

export async function POST(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const org_id = String(body?.org_id || "");
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  // Send a test notification to the current recipients.
  if (body?.test) {
    const prefs = await rt.notify.getPrefs(org_id);
    if (!prefs.recipients.length) return NextResponse.json({ error: "no recipients configured" }, { status: 400 });
    const org = await rt.admin.getOrg(org_id).catch(() => null);
    const hub = await rt.hub.createHub({ org_id });
    const { sendCustomerNotification } = await import("@/lib/email");
    const sent = await sendCustomerNotification({
      to: prefs.recipients,
      subject: `Test — Runtime Governance updates · Resurrection Tech`,
      heading: "Test notification",
      body: `This is a test of Runtime Governance customer notifications for ${org?.name || "your organisation"}. If you received this, delivery is working.`,
      orgName: org?.name || null,
      ctaLabel: "Open evidence hub",
      ctaUrl: `${originOf(req)}${hub.path}`,
      footerNote: "Test message sent by your Resurrection Tech engagement lead.",
    });
    await rt.adminaudit.record({ action: "customer_notify_test", actor: authz.identity, via: authz.via, target: org_id, meta: { ok: sent.ok, recipients: prefs.recipients.length } });
    return sent.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: sent.error || "email failed" }, { status: 502 });
  }

  // Send a significant governance event alert now (opt-in respected).
  if (body?.significant_event) {
    const r = await notifyCustomer({ org_id, event: "significant_event", origin: originOf(req), context: { message: String(body?.message || "") } });
    await rt.adminaudit.record({ action: "customer_significant_event", actor: authz.identity, via: authz.via, target: org_id, meta: { sent: !!r.sent, skipped: r.skipped } });
    if (!r.ok) return NextResponse.json({ error: r.error || "send failed" }, { status: 502 });
    return NextResponse.json({ ok: true, sent: !!r.sent, skipped: r.skipped });
  }

  // Otherwise: upsert preferences.
  const patch: any = {};
  if (body?.enabled != null) patch.enabled = !!body.enabled;
  if (body?.recipients != null) patch.recipients = Array.isArray(body.recipients) ? body.recipients : String(body.recipients).split(/[,\s]+/);
  if (body?.events != null && typeof body.events === "object") patch.events = body.events;
  const prefs = await rt.notify.setPrefs(org_id, patch);
  await rt.adminaudit.record({ action: "customer_notify_prefs", actor: authz.identity, via: authz.via, target: org_id, meta: { enabled: prefs.enabled, recipients: prefs.recipients.length } });
  return NextResponse.json({ ok: true, prefs });
}
