/** Guardian OS — Dynamic Runtime Governance Policies (self-service foundation).
 *   GET                       → policy list + summary
 *   GET ?view=active          → the active set the kernel is loading now
 *   GET ?view=history&name=…  → all versions of a policy (audit trail)
 *     (operator session/admin key, or client key with `status` scope — read-only)
 *   POST { action:'draft',    name, domain, spec, scope?, notes? }
 *   POST { action:'validate', id }
 *   POST { action:'activate', id }   → GOVERNED: proposes activate_governance_policy
 *                                       and applies the operator's own approval, so
 *                                       activation flows proposal → Ω governor →
 *                                       approval → execution → evidence.
 *   POST { action:'rollback', name, scope?, to_version? }  → always allowed
 *                                       (the safety brake), applied directly + audited.
 *
 * Drafting/validating is operator-direct; ADDING a live constraint to the kernel
 * is governed; ROLLING BACK is always allowed. Existing guarantees unchanged. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
  const G: any = ops.govpolicy;
  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "";
  if (view === "active") return NextResponse.json({ active: await G.active({}) });
  if (view === "history") {
    const name = url.searchParams.get("name") || "";
    return NextResponse.json({ name, history: await G.history(name, url.searchParams.get("scope") || "global") });
  }
  const [policies, summary] = await Promise.all([G.list({ limit: 200 }), G.summary()]);
  return NextResponse.json({ policies, summary });
}

export async function POST(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body?.action || "");
  const G: any = ops.govpolicy;
  const actor = op.identity;

  try {
    if (action === "draft") {
      const p = await G.draft({ name: String(body?.name || ""), domain: String(body?.domain || ""), spec: body?.spec || {}, scope: body?.scope || "global", notes: body?.notes || null, created_by: actor });
      return NextResponse.json({ ok: true, policy: p });
    }
    if (action === "validate") {
      const p = await G.validate(String(body?.id || ""), { actor });
      return NextResponse.json({ ok: true, policy: p });
    }
    if (action === "rollback") {
      const r = await G.rollback({ name: String(body?.name || ""), scope: body?.scope || "global", to_version: body?.to_version ?? null, actor });
      return NextResponse.json({ ok: true, rollback: r });
    }
    if (action === "activate") {
      const id = String(body?.id || "");
      const pol = await G.get(id);
      if (!pol) return NextResponse.json({ error: "policy not found" }, { status: 404 });
      // Governed activation: propose → Ω governor → operator's own approval → execute.
      const proposed = await (ops.proposals as any).propose({
        action_id: "activate_governance_policy",
        params: { policy_id: id, actor },
        source: `operator:${actor}`,
        reasoning: { decision: "activate_governance_policy", confidence: 1, reason: `Operator activating Ω policy ${pol.name} v${pol.version}`, source: `operator:${actor}` },
      });
      if (proposed.status === "blocked") {
        return NextResponse.json({ ok: false, blocked: true, proposal: proposed, error: `activation blocked by Runtime Governance: ${proposed.decision?.reason || "blocked"}` }, { status: 409 });
      }
      const approved = await (ops.proposals as any).approve(proposed.id, { actor, note: `activate Ω policy ${pol.name} v${pol.version}` });
      const policy = await G.get(id);
      const ok = approved.status === "executed" && policy.status === "active";
      return NextResponse.json({ ok, proposal: approved, policy }, { status: ok ? 200 : 409 });
    }
    return NextResponse.json({ error: "action must be draft, validate, activate, or rollback" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "policy operation failed" }, { status: 400 });
  }
}
