/** Operations Agent — Gmail OAuth callback.
 *   GET ?code&state → operator-only + CSRF `state` verification. Exchanges the
 *   code for tokens (storing the refresh token ENCRYPTED), then redirects back
 *   to the Systems tab. Read-only scope; no mailbox mutation ever. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function backTo(req: NextRequest, params: Record<string, string>) {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, "");
  const u = new URL(`${site}/admin/operations`);
  u.searchParams.set("view", "systems");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return NextResponse.redirect(u.toString(), { status: 302 });
}

export async function GET(req: NextRequest) {
  const op = rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });

  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const err = url.searchParams.get("error");
  if (err) return backTo(req, { gmail: "error", reason: err });

  const payload = rt.adminauth.verifyToken(state);
  if (!payload || payload.sub !== "gmail_oauth") return backTo(req, { gmail: "error", reason: "invalid_state" });
  if (!code) return backTo(req, { gmail: "error", reason: "missing_code" });

  try {
    const res = await (ops.gmail as any).exchangeCode(code, { connected_by: op.identity });
    if (!res.ok) return backTo(req, { gmail: "error", reason: "exchange_failed" });
    await rt.adminaudit.record({ action: "ops_gmail_connected", actor: op.identity, via: op.via, target: null, meta: { mailbox: res.mailbox_email, scope: "gmail.readonly" } });
    return backTo(req, { gmail: "connected" });
  } catch {
    return backTo(req, { gmail: "error", reason: "exchange_error" });
  }
}
