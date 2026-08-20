import { NextResponse } from "next/server";
import * as reviewerAuth from "@/lib/frontier-reviewer-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const reviewer = reviewerAuth.createPasswordlessSession();
  if (!reviewer.ok || !reviewer.token) {
    return NextResponse.json({ error: reviewer.error || "reviewer access unavailable" }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true, role: "reviewer", exp: reviewer.exp });
  response.cookies.set(reviewerAuth.SESSION_COOKIE, reviewer.token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/frontier",
    maxAge: reviewer.maxAgeSec,
  });
  return response;
}
