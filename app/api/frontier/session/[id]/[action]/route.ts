import { NextRequest, NextResponse } from "next/server";
import { authorizeFrontier, reviewerAuth, reviewerGrantToken } from "@/lib/frontier-access";
import { frontierService, publicFrontierError } from "@/lib/frontier-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ACTIONS = new Set(["pause", "resume", "stop", "terminate", "deny", "continue_without_action", "approve"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; action: string }> }) {
  const access = authorizeFrontier(req);
  if (!access.ok) return NextResponse.json({ error: "Frontier authentication required" }, { status: 401 });
  const { id, action } = await params;
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "Unknown session action" }, { status: 422 });
  if (access.role === "reviewer" && !reviewerAuth.canAccessSession(reviewerGrantToken(req), id)) {
    return NextResponse.json({ error: "Reviewer access is limited to sessions created in this reviewer session." }, { status: 403 });
  }
  const { res, data } = await frontierService(`/v1/frontier/session/${encodeURIComponent(id)}/${action}`, { method: "POST", body: "{}" });
  return NextResponse.json(res.ok ? data : { error: publicFrontierError(data, "Session control failed") }, {
    status: res.status,
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
