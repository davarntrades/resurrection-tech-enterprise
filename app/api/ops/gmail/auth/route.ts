/** Operations Agent — Gmail connect (read-only inbox monitoring).
 *   GET → operator-only. Builds the Google consent URL (gmail.readonly, offline,
 *   forced consent) with a signed CSRF `state` and redirects the operator to
 *   Google. No mailbox is touched until the operator consents. */
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
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  if (!(ops.gmail as any).configured()) {
    return NextResponse.json({ error: "Gmail OAuth not configured — set OPS_GMAIL_CLIENT_ID and OPS_GMAIL_CLIENT_SECRET" }, { status: 400 });
  }
  const state = rt.adminauth.issueToken("gmail_oauth");
  if (!state) return NextResponse.json({ error: "state signing unavailable" }, { status: 500 });
  try {
    const url = (ops.gmail as any).authUrl(state.token);
    return NextResponse.redirect(url, { status: 302 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "could not build consent URL" }, { status: 400 });
  }
}
