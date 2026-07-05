/** Runtime Governance — scheduled reporting (L6).
 *
 * Hit by a Vercel Cron (see vercel.json) to generate governance-evidence reports
 * for every active org on a cadence: daily / weekly (Mon) / monthly (1st) /
 * quarterly. Gated by CRON_SECRET (Vercel sends it as a bearer token). No
 * customer key required — this is an internal scheduled job. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || auth !== secret) return NextResponse.json({ error: "cron secret required" }, { status: 401 });

  // Choose the periods due today (a daily cron drives all cadences).
  const now = new Date();
  const explicit = new URL(req.url).searchParams.get("period");
  const periods = explicit ? [explicit] : (() => {
    const p = ["daily"];
    if (now.getUTCDay() === 1) p.push("weekly");             // Mondays
    if (now.getUTCDate() === 1) { p.push("monthly"); if ([0, 3, 6, 9].includes(now.getUTCMonth())) p.push("quarterly"); }
    return p;
  })();

  const results: any[] = [];
  for (const period of periods) {
    if (!rt.reports.PERIODS.includes(period)) continue;
    results.push(await rt.reports.generateAllDue({ period }));
  }
  rt.log.info("cron_reports", { periods, orgs: results.reduce((n, r) => n + r.generated, 0) });

  // Phase 3 — periodic alert sweep rides the daily cron (no extra Vercel cron
  // entry needed). Real-time record_failure alerts fire inline from the gateway.
  let alerts: any = null;
  try { alerts = await rt.alerts.sweep(); rt.log.info("cron_alerts", alerts); }
  catch (e: any) { rt.log.warn("cron_alerts_failed", { error: e?.message || String(e) }); }

  return NextResponse.json({ ok: true, periods, results, alerts });
}
