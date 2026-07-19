/** Operations Agent — health. Public-safe: reports agent + trust-chain status
 * (governance engine reachability, store durability) without secrets. */
import { NextResponse } from "next/server";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await ops.health());
}
