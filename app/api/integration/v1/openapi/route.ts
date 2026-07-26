import { NextRequest, NextResponse } from "next/server";
import openapi from "@/lib/runtime/integration-openapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  return NextResponse.json(openapi.document(origin), {
    headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" },
  });
}
