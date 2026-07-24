/** Guardian OS — Executive Workspaces (Phase 4): role-specific lenses over the
 *  ONE enterprise digital twin. No parallel systems — every workspace is a pure
 *  projection of the same runtime governance engine, evidence, policies,
 *  recommendations and intelligence the rest of the Control Room already serves.
 *   GET                              → the executive perspectives (navigation) + overview
 *   GET ?role=ceo&org_id=…           → one executive workspace, framed for that role
 *     (operator session/admin key, or client key with `status` scope — read-only)
 *
 * Adding a workspace is data-only (a ROLES entry in lib/ops/workspaces.js); the
 * Runtime Governance kernel is never touched. */
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
  const W: any = ops.workspaces;
  const url = new URL(req.url);
  const role = url.searchParams.get("role") || "";
  const org_id = url.searchParams.get("org_id") || "";
  if (role) {
    const workspace = await W.workspace(role, org_id);
    if (!workspace) return NextResponse.json({ error: "unknown role" }, { status: 404 });
    return NextResponse.json({ workspace });
  }
  return NextResponse.json({ roles: W.roles(), overview: await (ops.managed as any).overview() });
}
