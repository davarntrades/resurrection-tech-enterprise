/** Operations Agent — Executive Command: autonomy control (Phase 4).
 *   GET  → current autonomy state (mode, policy, paused agents) + mode catalog
 *          and the agent roster (for per-agent pause controls).
 *     (operator session/admin key, or client key with `status` scope — read-only)
 *   POST { action:'set_mode', mode }        → change the autonomy mode. SAFETY
 *          ASYMMETRY: lowering (toward emergency_pause) applies DIRECTLY and is
 *          audited — a fail-safe brake that works even with the engine down.
 *          Raising routes through the governed set_autonomy_mode action + the Ω
 *          rule ops_unauthorized_autonomy_change, then the operator's own
 *          approval — the engine is what permits the raise.
 *   POST { action:'emergency_pause' }        → hard brake (always a lowering).
 *   POST { action:'pause_agent', agent_id }  → pause one specialist.
 *   POST { action:'resume_agent', agent_id } → resume one specialist. */
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
  const A: any = ops.autonomy;
  const state = await A.current();
  const modes = A.MODES.map((m: string) => ({ id: m, label: A.LABELS[m], level: A.level(m), policy: A.policy(m) }));
  const agents = (ops.agents as any).AGENTS.map((a: any) => ({ id: a.id, title: a.title, paused: state.paused_agents.includes(a.id) }));
  return NextResponse.json({ state, modes, agents });
}

export async function POST(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body?.action || "");
  const A: any = ops.autonomy;
  const actor = op.identity;

  try {
    if (action === "pause_agent" || action === "resume_agent") {
      const agent_id = String(body?.agent_id || "");
      if (!(ops.agents as any).get(agent_id)) return NextResponse.json({ error: `unknown agent ${JSON.stringify(agent_id)}` }, { status: 400 });
      const state = action === "pause_agent" ? await A.pauseAgent(agent_id, { actor }) : await A.resumeAgent(agent_id, { actor });
      return NextResponse.json({ ok: true, action, agent_id, state });
    }

    // Determine the target mode (emergency_pause is a named shorthand).
    const target = action === "emergency_pause" ? "emergency_pause" : String(body?.mode || "");
    if (action !== "set_mode" && action !== "emergency_pause") {
      return NextResponse.json({ error: "action must be set_mode, emergency_pause, pause_agent, or resume_agent" }, { status: 400 });
    }
    if (!A.isValid(target)) return NextResponse.json({ error: `invalid autonomy mode ${JSON.stringify(target)}` }, { status: 400 });

    const from = (await A.current()).mode;
    const raising = A.isRaise(from, target);

    // LOWERING (or unchanged): apply directly — the fail-safe brake is never
    // gated on the engine. setMode records the change in the audit trail.
    if (!raising) {
      const state = await A.setMode(target, { actor });
      return NextResponse.json({ ok: true, action, direction: from === target ? "unchanged" : "lowered", from, to: target, state });
    }

    // RAISING: route through the governed action. A bare proposal escalates
    // (the Ω rule blocks a raise without approval); the authenticated operator's
    // own approval then re-evaluates WITH the authorisation flags, and the
    // engine — not the API — issues the permit that executes the raise.
    const proposed = await (ops.proposals as any).propose({
      action_id: "set_autonomy_mode",
      params: { mode: target, actor, flags: { raising_autonomy: true } },
      source: `operator:${actor}`,
      reasoning: { decision: "set_autonomy_mode", confidence: 1, reason: `Operator raising autonomy ${from} → ${target}`, source: `operator:${actor}` },
    });
    if (proposed.status === "blocked") {
      return NextResponse.json({ ok: false, action, direction: "raised", blocked: true, from, to: target, proposal: proposed,
        error: `raise blocked by Runtime Governance: ${proposed.decision?.reason || "blocked"}` }, { status: 409 });
    }
    const approved = await (ops.proposals as any).approve(proposed.id, { actor, note: `operator raising autonomy ${from} → ${target}` });
    const state = await A.current();
    const ok = approved.status === "executed" && state.mode === target;
    return NextResponse.json({ ok, action, direction: "raised", from, to: target, proposal: approved, state }, { status: ok ? 200 : 409 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "autonomy update failed" }, { status: 400 });
  }
}
