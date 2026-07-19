/** Operations Agent — proposal queue.
 *   GET  ?status=&org_id=            → proposals + summary (operator, or client
 *                                      key with proposals:read — read-only)
 *   POST { id, decision: "approve"|"deny", note? }
 *                                    → operator sign-off on an escalated
 *                                      proposal. Approval re-evaluates through
 *                                      Runtime Governance with authorisation
 *                                      flags — it is not a bypass.
 *   POST { action_id, params, org_id? } → operator-initiated proposal (still
 *                                      fully governed like an agent proposal). */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const client = await (ops.clients as any).authenticate(key, { requireScope: "proposals:read" });
    if (!client.ok) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  const url = new URL(req.url);
  const P: any = ops.proposals;
  const [items, summary] = await Promise.all([
    P.list({ status: url.searchParams.get("status") || undefined, org_id: url.searchParams.get("org_id") || undefined }),
    P.summary(),
  ]);
  return NextResponse.json({ proposals: items, summary, statuses: P.STATUSES });
}

export async function POST(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const P: any = ops.proposals;

  try {
    if (body?.id && body?.decision) {
      const fn = body.decision === "approve" ? P.approve : body.decision === "deny" ? P.deny : null;
      if (!fn) return NextResponse.json({ error: "decision must be approve or deny" }, { status: 400 });
      const proposal = await fn(String(body.id), { actor: op.identity, note: body.note || null });
      return NextResponse.json({ ok: true, proposal });
    }
    if (body?.action_id) {
      const proposal = await P.propose({
        action_id: String(body.action_id),
        params: body.params || {},
        org_id: body.org_id || null,
        source: `operator:${op.identity}`,
      });
      return NextResponse.json({ ok: true, proposal });
    }
    return NextResponse.json({ error: "provide {id, decision} or {action_id, params}" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "proposal operation failed" }, { status: 400 });
  }
}
