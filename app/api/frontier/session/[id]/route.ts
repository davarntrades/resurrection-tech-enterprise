import { NextRequest, NextResponse } from "next/server";
import { authorizeFrontier, reviewerAuth, reviewerGrantToken } from "@/lib/frontier-access";
import { frontierService, publicFrontierError } from "@/lib/frontier-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = authorizeFrontier(req);
  if (!access.ok) return NextResponse.json({ error: "Frontier authentication required" }, { status: 401 });
  const { id } = await params;
  if (access.role === "reviewer" && !reviewerAuth.canAccessSession(reviewerGrantToken(req), id)) {
    return NextResponse.json({ error: "Reviewer access is limited to sessions created in this reviewer session." }, { status: 403 });
  }
  const { res, data } = await frontierService(`/v1/frontier/session/${encodeURIComponent(id)}`);
  return NextResponse.json(res.ok ? data : { error: publicFrontierError(data, "Session unavailable") }, {
    status: res.status,
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
