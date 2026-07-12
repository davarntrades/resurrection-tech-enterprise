/** Runtime Governance — engagement management (operator CRM, operator-authed).
 *   GET  ?org_id=                                → the org's engagement record
 *   GET  ?due=1                                  → orgs due for review (soonest first)
 *   POST { org_id, stage?/next_review_date?/last_review_date?/cadence?/delivery_schedule? }
 *   POST { org_id, add_contact:{name,email,role} }
 *   POST { org_id, remove_contact:<id> }
 *   POST { org_id, note:"..." }
 * Operator-only surface (Control Room). Never exposed to customers — there is no
 * customer-facing engagement route. */
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
  const E: any = rt.engagement;
  const url = new URL(req.url);
  if (url.searchParams.get("due")) return NextResponse.json({ due: await E.dueForReview() });
  const org_id = url.searchParams.get("org_id") || "";
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  return NextResponse.json({ engagement: await E.get(org_id), cadences: E.CADENCES, stages: E.STAGES });
}

export async function POST(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  const E: any = rt.engagement;
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const org_id = String(body?.org_id || "");
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  try {
    let engagement: any;
    let action = "update_engagement";
    if (body?.add_contact) { engagement = await E.addContact(org_id, body.add_contact); action = "engagement_add_contact"; }
    else if (body?.remove_contact) { engagement = await E.removeContact(org_id, String(body.remove_contact)); action = "engagement_remove_contact"; }
    else if (body?.note != null) { engagement = await E.addNote(org_id, String(body.note)); action = "engagement_add_note"; }
    else {
      const patch: any = {};
      for (const k of ["stage", "next_review_date", "last_review_date", "cadence", "delivery_schedule"]) if (body[k] !== undefined) patch[k] = body[k];
      engagement = await E.set(org_id, patch);
    }
    await rt.adminaudit.record({ action, actor: authz.identity, via: authz.via, target: org_id });
    return NextResponse.json({ ok: true, engagement });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "engagement write failed" }, { status: 400 });
  }
}
