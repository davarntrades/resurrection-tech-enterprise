/** Runtime Governance — ingest API-key management.
 *   GET  ?org_id=…                 → list keys for an org (hashes never returned)
 *   POST { org_id, environment_id?, role?, label?, rotate_key_id? }
 *                                  → issue a new key (plaintext returned ONCE);
 *                                    if rotate_key_id is given, revoke it first.
 * Auth: operator session OR x-admin-key. Recorded in the admin action audit. */
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
  return NextResponse.json({ keys: await rt.admin.listApiKeys(org_id) });
}

export async function POST(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const org_id = String(body?.org_id || "");
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  // Guard against issuing a key /evaluate can't see on a non-durable store.
  const durable = rt.store.durable();
  if (!durable && /^(1|true|yes)$/i.test(process.env.RUNTIME_REQUIRE_DURABLE || ""))
    return NextResponse.json({ error: "refusing to issue a key on a non-durable store — configure Supabase so the key persists (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)" }, { status: 503 });

  try {
    if (body?.rotate_key_id) {
      const current = await rt.store.findOne("api_keys", { id: String(body.rotate_key_id) });
      if (!current || current.org_id !== org_id) return NextResponse.json({ error: "credential not found for organisation" }, { status: 404 });
    }
    const keyOptions = {
      role: body?.role || (body?.rotate_key_id ? undefined : "ingest"),
      label: body?.label || (body?.rotate_key_id ? undefined : "integration credential"),
      scopes: body?.scopes || null,
      expires_at: body?.expires_at || null,
      environment_restrictions: body?.environment_restrictions || null,
    };
    const issued = body?.rotate_key_id
      ? await rt.admin.rotateApiKey(String(body.rotate_key_id), keyOptions)
      : await rt.admin.issueApiKey({ org_id, environment_id: body?.environment_id || null, ...keyOptions });
    await rt.adminaudit.record({ action: body?.rotate_key_id ? "rotate_key" : "issue_key", actor: authz.identity, via: authz.via, target: org_id, meta: { rotated: body?.rotate_key_id || null } });
    // Plaintext key is returned ONCE.
    return NextResponse.json({ ok: true, key: issued.key, record: issued.record, durable, ...(durable ? {} : { warning: "store is NON-DURABLE (ephemeral file store) — this key may not authenticate on /evaluate across requests. Configure Supabase." }) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "key operation failed" }, { status: 500 });
  }
}
