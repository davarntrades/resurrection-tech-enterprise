/** Guardian OS — Industry Intelligence Packs (Phase 5).
 *
 * Packs extend Guardian OS with domain intelligence — they never fork it. A
 * pack contributes Ω policies (installed through the dynamic policy engine),
 * a specialised dashboard projected over the SAME shared enterprise context,
 * executive metrics, recommendations, templates and evidence mappings.
 *
 *   GET                                → the pack catalog (+ installed, if org_id)
 *   GET ?view=dashboard&pack=…&org_id=… → a pack's specialised dashboard
 *   GET ?view=templates&org_id=…        → policy templates from installed packs
 *   GET ?view=summary&org_id=…          → what the industry layer contributes
 *     (operator session/admin key, or client key with `status` scope — read-only)
 *   POST { action:'install'|'uninstall', org_id, pack }   (operator only)
 *
 * Installing activates the pack's deny-only Ω policies through the existing
 * governed lifecycle; uninstalling rolls them back. The Runtime Governance
 * kernel is never modified. */
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
  const I: any = ops.industry;
  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "";
  const org_id = url.searchParams.get("org_id") || "";
  const pack = url.searchParams.get("pack") || "";
  if (view === "dashboard") {
    const dashboard = await I.dashboard(org_id, pack);
    if (!dashboard) return NextResponse.json({ error: "unknown pack or enterprise" }, { status: 404 });
    return NextResponse.json({ dashboard });
  }
  if (view === "templates") return NextResponse.json({ templates: await I.templates(org_id) });
  if (view === "summary") return NextResponse.json({ summary: await I.summary(org_id) });
  return NextResponse.json({
    catalog: I.catalog(),
    installed: org_id ? await I.installed(org_id) : [],
    overview: await (ops.managed as any).overview(),
  });
}

export async function POST(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body?.action || "");
  const org_id = String(body?.org_id || "");
  const pack = String(body?.pack || "");
  const I: any = ops.industry;
  try {
    if (action === "install") return NextResponse.json({ ok: true, result: await I.install(org_id, pack, { actor: op.identity }) });
    if (action === "uninstall") return NextResponse.json({ ok: true, result: await I.uninstall(org_id, pack, { actor: op.identity }) });
    return NextResponse.json({ error: "action must be install or uninstall" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "industry pack action failed" }, { status: 400 });
  }
}
