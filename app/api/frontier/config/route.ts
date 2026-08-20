import { NextRequest, NextResponse } from "next/server";
import { authorizeFrontier } from "@/lib/frontier-access";
import { frontierService, publicFrontierError } from "@/lib/frontier-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!authorizeFrontier(req).ok) {
    return NextResponse.json({ error: "Frontier authentication required" }, { status: 401 });
  }
  try {
    const { res, data } = await frontierService("/v1/frontier/config");
    if (!res.ok) {
      return NextResponse.json({ error: publicFrontierError(data, "Frontier service unavailable") }, { status: res.status });
    }
    return NextResponse.json(data, { headers: { "cache-control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "Frontier service unavailable" }, { status: 503 });
  }
}
