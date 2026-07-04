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
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "invalid credentials" ? 401 : 503 });

  await rt.adminaudit.record({ action: "login", actor: "operator", via: "session" });
  const res = NextResponse.json({ ok: true, exp: r.exp });
  res.cookies.set(rt.adminauth.SESSION_COOKIE, r.token, {
    httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: r.maxAgeSec,
  });
  return res;
}
