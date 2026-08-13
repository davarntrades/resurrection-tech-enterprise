import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import { frontierService, publicFrontierError } from "@/lib/frontier-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ACTIONS = new Set(["pause", "resume", "stop", "terminate", "deny", "continue_without_action", "approve"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; action: string }> }) {
  const auth = rt.adminauth.authorize({ sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value, adminKey: req.headers.get("x-admin-key") || undefined });
  if (!auth.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  const { id, action } = await params;
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "Unknown session action" }, { status: 422 });
  const { res, data } = await frontierService(`/v1/frontier/session/${encodeURIComponent(id)}/${action}`, { method: "POST", body: "{}" });
  return NextResponse.json(res.ok ? data : { error: publicFrontierError(data, "Session control failed") }, { status: res.status });
}
