/** Runtime Governance — operator login plus scoped Frontier reviewer access.
 * Operator credentials keep the existing admin session. A separately configured
 * Frontier reviewer credential receives only a Frontier-scoped cookie and can
 * never authorize admin/control-room routes.
 */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import * as reviewerAuth from "@/lib/frontier-reviewer-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const password = String(body?.password || "");

  const operator = rt.adminauth.login(password);
  if (operator.ok && operator.token) {
    await rt.adminaudit.record({ action: "login", actor: "operator", via: "session" });
    const res = NextResponse.json({ ok: true, role: "operator", exp: operator.exp });
    res.cookies.set(rt.adminauth.SESSION_COOKIE, operator.token, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: operator.maxAgeSec,
    });
    return res;
  }

  const reviewer = reviewerAuth.login(password);
  if (reviewer.ok && reviewer.token) {
    const res = NextResponse.json({ ok: true, role: "reviewer", exp: reviewer.exp });
    // Deliberately scoped to Frontier APIs. This cookie is never accepted by
    // Control Room/admin routes and is not sent to them by the browser.
    res.cookies.set(reviewerAuth.SESSION_COOKIE, reviewer.token, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/api/frontier", maxAge: reviewer.maxAgeSec,
    });
    return res;
  }

  const operatorUnavailable = operator.error && operator.error !== "invalid credentials";
  const reviewerUnavailable = reviewer.error && reviewer.error !== "invalid credentials";
  const status = operatorUnavailable && reviewerUnavailable ? 503 : 401;
  return NextResponse.json({ error: status === 401 ? "invalid credentials" : "login unavailable" }, { status });
}
