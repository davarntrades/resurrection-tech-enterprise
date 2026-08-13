import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import { frontierService, publicFrontierError } from "@/lib/frontier-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = rt.adminauth.authorize({ sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value, adminKey: req.headers.get("x-admin-key") || undefined });
  if (!auth.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  const { id } = await params;
  const { res, data } = await frontierService(`/v1/frontier/session/${encodeURIComponent(id)}`);
  return NextResponse.json(res.ok ? data : { error: publicFrontierError(data, "Session unavailable") }, { status: res.status });
}
