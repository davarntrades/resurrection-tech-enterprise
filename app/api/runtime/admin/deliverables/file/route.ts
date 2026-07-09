/** Runtime Governance — preview / download a deliverable (operator-authed).
 *   GET ?id=<deliverable_id>&mode=preview|download
 * Streams the bytes from object storage. Auth: operator session OR x-admin-key. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(req: NextRequest) {
  return rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
}

export async function GET(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id") || "";
  const mode = sp.get("mode") === "download" ? "download" : "preview";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const del = await rt.deliverables.getDeliverable(id);
    if (!del) return NextResponse.json({ error: "deliverable not found" }, { status: 404 });
    const bytes = await rt.deliverables.readBytes(del);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": del.mime || "application/octet-stream",
        "content-disposition": `${mode === "download" ? "attachment" : "inline"}; filename="${del.filename}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed to read deliverable" }, { status: 500 });
  }
}
