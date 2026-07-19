/** Operations Agent — executive briefing (the "Morning." endpoint).
 * Operator session/admin key, or an external client key with `briefing` scope
 * (OpenClaw / Slack / Teams / Discord / WhatsApp / Telegram bridges).
 *   GET → { generated_at, counts, lines[], text } */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const op = rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
  if (!op.ok) {
    const key = req.headers.get("x-ops-client-key") || "";
    const client = await (ops.clients as any).authenticate(key, { requireScope: "briefing" });
    if (!client.ok) return NextResponse.json({ error: "operator or client authentication required" }, { status: 401 });
  }
  return NextResponse.json(await (ops.briefing as any).briefing());
}
