/** Operations Agent — briefing interaction ("Morning." → briefing).
 * Restricted intent router over authorised operational data — NOT a chatbot.
 * Operator session/admin key, or client key with `briefing` scope.
 *   POST { prompt } → { ok, intent, text, ...grounded payload } */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const op = rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
  if (!op.ok) {
    const key = req.headers.get("x-ops-client-key") || "";
    const client = await (ops.clients as any).authenticate(key, { requireScope: "briefing" });
    if (!client.ok) return NextResponse.json({ error: "operator or client authentication required" }, { status: 401 });
  }
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const result = await (ops.ask as any).ask(String(body?.prompt || ""));
  return NextResponse.json(result);
}
