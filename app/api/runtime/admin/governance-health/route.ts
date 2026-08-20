import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function operator(req: NextRequest) {
  return rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
}

export async function GET(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });

  const started = Date.now();
  const result = await rt.engine.health();
  const configuration = typeof (rt.engine as any).configuration === "function"
    ? (rt.engine as any).configuration()
    : { configured: false, endpoint_source: "unknown", endpoint_host: null };

  const body = {
    ok: result.ok === true,
    checked_at: new Date().toISOString(),
    latency_ms: Date.now() - started,
    configuration,
    engine: result.ok === true
      ? {
          reachable: true,
          status: result.status || 200,
          service_version: result.json?.service_version || result.json?.version || null,
          ruleset_hash: result.json?.ruleset_hash || result.json?.attestation?.ruleset_hash || null,
        }
      : {
          reachable: false,
          status: result.status || null,
          code: result.code || "GOVERNANCE_UNAVAILABLE",
          error: result.error || (result.status ? `engine HTTP ${result.status}` : "Runtime Governance unavailable"),
        },
  };

  return NextResponse.json(body, {
    status: body.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
