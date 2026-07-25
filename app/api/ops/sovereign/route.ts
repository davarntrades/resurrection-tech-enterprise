/** Guardian OS Sovereign (Phase 6) — deployment posture + verification.
 *
 * The Control Room's window onto WHERE this deployment is running: which
 * profile, whether state is local or cloud, whether the Ω policy bundle
 * verified, whether the runtime is immutable, and what update packages have
 * been applied. A sovereign operator with no shell access gets exactly what
 * `guardian verify` prints at a terminal.
 *
 *   GET                    → deployment posture (cheap, no store reads)
 *   GET ?view=verify       → the full eight-check verification report
 *   GET ?view=updates      → applied offline update packages, newest first
 *     (operator session/admin key, or client key with `status` scope)
 *
 * READ-ONLY BY DESIGN. Installing bundles and applying updates happen at the
 * console with `guardian`, where the media physically is — not over HTTP. There
 * is no POST here, and that is deliberate: an air-gapped estate's supply chain
 * should not have a network-reachable write path. */
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
  const sovereign: any = require("@/lib/sovereign");
  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "";
  const org_id = url.searchParams.get("org_id") || null;

  try {
    if (view === "verify") return NextResponse.json({ verification: await sovereign.verify.run({ org_id }) });
    if (view === "updates") return NextResponse.json({ updates: await sovereign.updates.history({ org_id }) });
    return NextResponse.json({
      deployment: sovereign.status(),
      store: { backend: rt.store.backend(), durable: rt.store.durable(), cloud_refused: rt.store.cloudRefused() },
      packs: { available: (ops.industry as any).PACK_IDS, projections: Object.fromEntries((ops.industry as any).PACK_IDS.map((id: string) => [id, sovereign.packs.projectionMode(id)])) },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "sovereign status failed" }, { status: 500 });
  }
}
