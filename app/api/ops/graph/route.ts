/** Operations Agent — Enterprise Memory / Evidence Graph (Phase 3).
 *   GET ?org_id=<id>              → the org's derived evidence graph
 *                                   (nodes + edges + provenance + contradictions)
 *   GET ?org_id=<id>&node=<id>    → trace one node back to its records + evidence
 *   GET ?org_id=<id>&view=replay  → the org's governed decision timeline
 *     (operator session/admin key, or client key with `status` scope — read-only)
 *   The graph is a read-only projection over authoritative records and is
 *   strictly tenant-scoped — an org_id is required and only that org is returned. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const op = rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
  if (!op.ok) {
    const key = req.headers.get("x-ops-client-key") || "";
    const client = await (ops.clients as any).authenticate(key, { requireScope: "status" });
    if (!client.ok) return NextResponse.json({ error: "operator or client authentication required" }, { status: 401 });
  }
  const url = new URL(req.url);
  const org_id = url.searchParams.get("org_id") || "";
  if (!org_id) return NextResponse.json({ error: "org_id is required — the memory graph is tenant-scoped" }, { status: 400 });
  const G: any = ops.graph;
  const node = url.searchParams.get("node");
  const view = url.searchParams.get("view");
  if (node) return NextResponse.json({ trace: await G.trace(org_id, node) });
  if (view === "replay") return NextResponse.json({ org_id, replay: await G.replay(org_id) });
  const graph = await G.build(org_id);
  if (!graph) return NextResponse.json({ error: "organisation not found" }, { status: 404 });
  return NextResponse.json({ graph });
}
