/** Runtime Governance — platform health + diagnostics (engine reachability,
 * store backend, tenancy). Public: reveals no customer data. */
import { NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await rt.health());
}
