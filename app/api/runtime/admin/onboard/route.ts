/** Runtime Governance — one-shot customer onboarding (the "yes after audit"
 * moment). Provisions the org, production (shadow) + staging environments, and a
 * production ingest key returned ONCE. From here the customer can integrate
 * immediately. Auth: operator session OR x-admin-key. Errors return JSON (so a
 * store/config failure is legible, not an opaque 500). Recorded in the audit. */
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

export async function POST(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required (session cookie or x-admin-key)" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  if (!body?.name) return NextResponse.json({ error: "name required" }, { status: 400 });

  try {
    const result = await rt.admin.onboardCustomer({ name: body.name, slug: body.slug, plan: body.plan });
    await rt.adminaudit.record({ action: "onboard", actor: authz.identity, via: authz.via, target: result.org?.id, meta: { name: body.name, slug: result.org?.slug } });
    return NextResponse.json(result);
  } catch (e: any) {
    // A store/schema/config failure returns a legible JSON error, not an opaque 500.
    return NextResponse.json({ error: e?.message || "onboarding failed" }, { status: 500 });
  }
}
