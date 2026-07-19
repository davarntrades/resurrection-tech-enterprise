/** Operations Agent — status (operator session/admin key, or client key with
 * `status` scope). Recent runs + proposal/evidence summaries. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize(req: NextRequest) {
  const op = rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
  if (op.ok) return { ok: true, via: "operator" };
  const key = req.headers.get("x-ops-client-key") || "";
  const client = await (ops.clients as any).authenticate(key, { requireScope: "status" });
  return client.ok ? { ok: true, via: "client", client: client.client } : { ok: false };
}

export async function GET(req: NextRequest) {
  const authz = await authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator or client authentication required" }, { status: 401 });
  const [health, runs, proposals, evidence] = await Promise.all([
    ops.health(),
    (ops.agent as any).runs({ limit: 10 }),
    (ops.proposals as any).summary(),
    (ops.evidence as any).summary({}),
  ]);
  return NextResponse.json({ health, runs, proposals, evidence });
}
