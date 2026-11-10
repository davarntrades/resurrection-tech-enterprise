/**
 * Deterministic execution-boundary scenarios.
 *
 * Runs the real Morrison kernel through approval, rejection, approval binding,
 * mutation, expiry, revocation, trajectory (local vs global) and restart
 * scenarios with an inert recorder. No model is called, so this route costs
 * nothing and has no side effects; it is still operator-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { authorizeFrontier } from "@/lib/frontier-access";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { frontierService, publicFrontierError } from "@/lib/frontier-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const access = authorizeFrontier(req);
  if (!access.ok) return NextResponse.json({ error: "Frontier authentication required" }, { status: 401 });
  const limited = rateLimit(clientIp(req.headers), { bucket: "frontier-boundary", max: 20, windowMs: 10 * 60 * 1000 });
  if (!limited.ok) {
    return NextResponse.json({ error: "Boundary scenario limit reached. Try again shortly." }, {
      status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) },
    });
  }
  try {
    const { res, data } = await frontierService("/v1/frontier/boundary", { method: "POST", body: "{}" });
    if (!res.ok) return NextResponse.json({ error: publicFrontierError(data, "Boundary scenarios failed") }, { status: res.status });
    return NextResponse.json(data, { headers: { "cache-control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "Boundary scenarios failed closed." }, { status: 502 });
  }
}
