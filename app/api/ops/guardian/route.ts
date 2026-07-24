/** Guardian OS — the unified executive surface (v0).
 *   GET                 → Executive Homepage: the seven CEO questions, grounded
 *                         in real records, every action deep-linked into the
 *                         existing governed flow (read-only; nothing executes).
 *   GET ?view=twin      → the full Digital Enterprise Twin (derived, read-only
 *                         projection: departments, customers, relationships,
 *                         enterprise health).
 *   GET ?view=entity&org_id=…  → one customer's twin slice, linked INTO the
 *                         Evidence Graph for provenance + replay.
 *     (operator session/admin key, or client key with `status` scope — read-only)
 *
 * Guardian OS is the OS; Runtime Governance is the kernel. This route only reads
 * + composes authoritative state — it holds no state and mutates nothing. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "";
  if (view === "twin") return NextResponse.json({ twin: await (ops.twin as any).build() });
  if (view === "entity") {
    const org_id = url.searchParams.get("org_id") || "";
    const entity = await (ops.twin as any).entity(org_id);
    if (!entity) return NextResponse.json({ error: "customer not found" }, { status: 404 });
    return NextResponse.json({ entity });
  }
  return NextResponse.json(await (ops.guardian as any).homepage());
}
