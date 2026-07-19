/** Operations Agent — Customer Intelligence (Pillar 2).
 * Deterministic, evidence-grounded per-customer scores. Operator session/admin
 * key, or a client key with `status` scope (read-only).
 *   GET                → all customers, scored, most-at-risk first
 *   GET ?org_id=<id>   → one customer with full evidence timeline */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const op = rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
  if (!op.ok) {
    const key = req.headers.get("x-ops-client-key") || "";
    const client = await (ops.clients as any).authenticate(key, { requireScope: "status" });
    if (!client.ok) return NextResponse.json({ error: "operator or client authentication required" }, { status: 401 });
  }
  const org_id = new URL(req.url).searchParams.get("org_id") || "";
  const I: any = ops.intelligence;
  if (org_id) {
    const detail = await I.detail(org_id);
    if (!detail) return NextResponse.json({ error: "organisation not found" }, { status: 404 });
    return NextResponse.json({ customer: detail });
  }
  return NextResponse.json({ customers: await I.list() });
}
