/** Runtime Governance — Evidence Hub file (customer-facing, credential-free).
 * Streams a deliverable's bytes IF the hub token is active AND the deliverable
 * belongs to that hub's org. Read-only; the operator surface is never exposed.
 *   GET /api/runtime/hub/<token>/file?id=<deliverable_id>&mode=preview|download
 */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id") || "";
  const mode = sp.get("mode") === "download" ? "download" : "preview";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const hub = await rt.hub.getHub(token);
  if (!hub || hub.state !== "active") {
    const msg = hub?.state === "revoked" ? "This evidence hub has been revoked." : "Evidence hub not found.";
    return NextResponse.json({ error: msg }, { status: hub?.state === "revoked" ? 410 : 404 });
  }
  const del: any = await rt.deliverables.getDeliverable(id);
  // Scope: the file must belong to this hub's org — nothing else is reachable.
  if (!del || del.org_id !== hub.org_id) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const bytes: Buffer = await rt.deliverables.readBytes(del);
    const plan = rt.deliverables.planByteResponse({
      size: bytes.length, mime: del.mime, filename: del.filename, mode, range: req.headers.get("range"),
    });
    const headers = { ...plan.headers, "x-robots-tag": "noindex, nofollow" };
    if (plan.status === 416) return new NextResponse(null, { status: 416, headers });
    const slice = bytes.subarray(plan.start, plan.end + 1);
    return new NextResponse(new Uint8Array(slice), { status: plan.status, headers });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed to read file" }, { status: 500 });
  }
}
