/** Runtime Governance — PERMANENT customer deletion (operator-authed).
 *   GET  ?org_id=                       → dependency preview (what will be deleted)
 *   POST { org_id, confirm }            → permanently delete; `confirm` must equal
 *                                          the org's exact name or slug
 * Irreversible. Operator-only — never exposed to customers. Intended primarily
 * for disposable test organisations. Revokes credentials/links first, deletes
 * only organisation-scoped records, fails closed on any cleanup error, and
 * preserves the operator audit trail (a deletion entry is written first). */
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
  const org_id = new URL(req.url).searchParams.get("org_id") || "";
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  try {
    return NextResponse.json({ preview: await rt.customeradmin.dependencyMap(org_id) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "preview failed" }, { status: 404 });
  }
}

export async function POST(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const org_id = String(body?.org_id || "");
  const confirm = String(body?.confirm ?? "");
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  if (!confirm) return NextResponse.json({ error: "confirmation (exact org name or slug) required" }, { status: 400 });

  try {
    // permanentDelete writes the operator audit record itself (before deleting),
    // and re-validates the confirmation against the target org — so a mismatched
    // name can never delete a different organisation.
    const result = await rt.customeradmin.permanentDelete(org_id, { confirm });
    return NextResponse.json(result);
  } catch (e: any) {
    // Fail closed: surface the failed step so the operator knows the state.
    return NextResponse.json({ error: e?.message || "deletion failed", failed_step: e?.failed_step || null }, { status: 400 });
  }
}
