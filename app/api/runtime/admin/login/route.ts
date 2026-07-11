/** Runtime Governance — operator login. Exchanges the operator password for an
 * httpOnly, signed session cookie used by the admin dashboard. Falls back to
 * RUNTIME_ADMIN_KEY as the bootstrap password when RUNTIME_OPERATOR_PASSWORD is
 * unset. The engine is never touched — operator-surface auth only. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const r = rt.adminauth.login(String(body?.password || ""));
  if (!r.ok || !r.token) return NextResponse.json({ error: r.error || "login unavailable" }, { status: r.error === "invalid credentials" ? 401 : 503 });

  await rt.adminaudit.record({ action: "login", actor: "operator", via: "session" });
  const res = NextResponse.json({ ok: true, exp: r.exp });
  // sameSite:"lax" (not "strict"): the operator opens deliverables via
  // target="_blank" links (Preview/Download) and reaches the Control Room across
  // the apex→www canonical redirect. Strict withholds the session cookie on those
  // top-level/new-tab navigations on iOS Safari (→ 401 "This page couldn't load").
  // Lax sends it on top-level GET navigations while still blocking cross-site POST
  // CSRF; the mutating admin endpoints are same-origin fetch, so unaffected.
  res.cookies.set(rt.adminauth.SESSION_COOKIE, r.token, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: r.maxAgeSec,
  });
  return res;
}
