/** Operations Agent — scheduled cycle. Hit by a Vercel Cron (CRON_SECRET as
 * bearer token, same contract as /api/runtime/cron/reports). Runs one full
 * governed agent cycle. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || auth !== secret) return NextResponse.json({ error: "cron secret required" }, { status: 401 });
  const result = await (ops.agent as any).runCycle({ trigger: "cron" });
  rt.log.info("cron_ops_cycle", { run_id: result.run_id, outcomes: result.outcomes || null });
  return NextResponse.json({ ok: !result.error, ...result });
}
