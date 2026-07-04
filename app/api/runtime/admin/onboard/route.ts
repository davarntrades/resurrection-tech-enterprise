/** Runtime Governance — one-shot customer onboarding (the "yes after audit"
 * moment). Gated by the RUNTIME_ADMIN_KEY header (internal use). Provisions the
 * org, production (shadow) + staging environments, and a production ingest key
 * returned ONCE. From here the customer can integrate immediately. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const adminKey = req.headers.get("x-admin-key") || "";
  if (!process.env.RUNTIME_ADMIN_KEY || adminKey !== process.env.RUNTIME_ADMIN_KEY)
    return NextResponse.json({ error: "admin key required (x-admin-key; set RUNTIME_ADMIN_KEY)" }, { status: 401 });
  let body: any = {}; try { body = await req.json(); } catch { /* empty */ }
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const result = await rt.admin.onboardCustomer({ name: body.name, slug: body.slug, plan: body.plan });
  return NextResponse.json(result);
}
