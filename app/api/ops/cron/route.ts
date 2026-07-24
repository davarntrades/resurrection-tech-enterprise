/** Operations Agent — scheduled cycle. Hit by a Vercel Cron (CRON_SECRET as
 * bearer token, same contract as /api/runtime/cron/reports). Runs one full
 * governed MULTI-AGENT (council) cycle: OBSERVE → RECONCILE → ROUTE (emit typed
 * handoffs) → PROPOSE → RECORD. Coordination stays gated behind OPS_COORDINATION
 * — with it off, this is the deterministic 4.0 council path plus handoff records
 * (no autonomous ingest), so the scheduled cadence is safe to observe before
 * go-live. */
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
  const result = await (ops.agents as any).dispatch({ trigger: "cron" });
  rt.log.info("cron_ops_council", { run_id: result.run_id, coordinating: result.coordinating, outcomes: result.outcomes || null, handoffs: result.handoffs || null });
  // Managed Governance: continuously watch every provisioned enterprise (drift +
  // health + governed recommendations). Best-effort — never fails the council run.
  let managed: any = null;
  try { managed = await (ops.managed as any).monitorAll({ actor: "guardian_os_cron" }); rt.log.info("cron_ops_managed", { orgs: managed.orgs }); }
  catch (e: any) { rt.log.error("cron_ops_managed_failed", { error: e?.message }); }
  return NextResponse.json({ ok: !result.error, ...result, managed });
}
