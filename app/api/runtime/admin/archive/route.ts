/** Runtime Governance — customer archive / restore (operator-authed).
 *   GET  ?archived=1               → list archived customers (+ preserved counts)
 *   POST { org_id, action:"archive" }  → archive (pause) a customer
 *   POST { org_id, action:"restore" }  → restore an archived customer
 * Archiving preserves ALL historical evidence; it only pauses the customer,
 * disables ingest credentials, and stops notifications. Operator-only surface —
 * customers never see these controls. Permanent deletion is separate. */
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
  return NextResponse.json({ archived: await rt.customeradmin.listArchived() });
}

export async function POST(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const org_id = String(body?.org_id || "");
  const action = String(body?.action || "");
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  if (action !== "archive" && action !== "restore") return NextResponse.json({ error: "action must be archive or restore" }, { status: 400 });

  try {
    // Record the operator action BEFORE mutating, so the intent is captured even
    // if a later step fails.
    await rt.adminaudit.record({ action: action === "archive" ? "archive_customer" : "restore_customer", actor: authz.identity, via: authz.via, target: org_id }).catch(() => {});
    const result = action === "archive" ? await rt.customeradmin.archive(org_id) : await rt.customeradmin.restore(org_id);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || `${action} failed` }, { status: 400 });
  }
}
