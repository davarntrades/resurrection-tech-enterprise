/** Guardian OS — Enterprise Provisioning (the OS installation).
 *   GET                          → provisioning runs + list
 *   GET ?view=example            → a realistic example enterprise spec
 *   GET ?view=command&org_id=…   → the Executive Command payload for an enterprise
 *   GET ?view=twin&org_id=…      → the six enterprise digital-twin graphs
 *     (operator session/admin key, or client key with `status` scope — read-only)
 *   POST { action:'plan', spec }      → preview counts (creates nothing)
 *   POST { action:'provision', spec } → install a complete governed runtime
 *
 * Provisioning generates Ω policies through the dynamic policy engine (govpolicy)
 * — deny-only, validated, evidence-backed — so every governance guarantee holds. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function operator(req: NextRequest) {
  return rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
}

export async function GET(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) {
    const key = req.headers.get("x-ops-client-key") || "";
    const client = await (ops.clients as any).authenticate(key, { requireScope: "status" });
    if (!client.ok) return NextResponse.json({ error: "operator or client authentication required" }, { status: 401 });
  }
  const P: any = ops.provisioning;
  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "";
  if (view === "example") return NextResponse.json({ spec: P.exampleSpec() });
  if (view === "command") {
    const org_id = url.searchParams.get("org_id") || "";
    const command = await P.command(org_id);
    if (!command) return NextResponse.json({ error: "enterprise not found" }, { status: 404 });
    return NextResponse.json({ command });
  }
  if (view === "twin") {
    const org_id = url.searchParams.get("org_id") || "";
    return NextResponse.json({ twin: await (ops.entgraph as any).build(org_id) });
  }
  const runs = await P.list({ limit: 50 });
  // If an additive migration has not been applied, say so explicitly rather
  // than returning a silently-empty list (or a 500).
  const pending = rt.store.pendingMigrations();
  return NextResponse.json({
    runs, departments: P.DEPARTMENTS,
    ...(pending.length ? { schema: { pending_migrations: pending, note: "Apply supabase/operations_agent.sql — these additive tables are missing, so provisioning history cannot be read." } } : {}),
  });
}

export async function POST(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body?.action || "");
  const P: any = ops.provisioning;
  try {
    if (action === "plan") return NextResponse.json({ ok: true, plan: P.plan(body?.spec || {}) });
    if (action === "provision") {
      const result = await P.provision(body?.spec || {}, { actor: op.identity });
      return NextResponse.json({ ok: result.status === "complete", result });
    }
    return NextResponse.json({ error: "action must be plan or provision" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "provisioning failed" }, { status: 400 });
  }
}
