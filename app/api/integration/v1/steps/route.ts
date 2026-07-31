import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import { environmentAllowed, integrationAuth } from "@/lib/integration-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const steps = rt.stepGovernance as any;

function statusFor(error: any) {
  return Number(error?.status) || (error?.code === "SESSION_NOT_FOUND" ? 404 : 400);
}

/** Read a session, its ordered steps, and optionally a determinism replay. */
export async function GET(req: NextRequest) {
  const gate: any = await integrationAuth(req, "runtime:read");
  if (gate.response) return gate.response;
  const url = new URL(req.url);
  const session_id = String(url.searchParams.get("session_id") || "");
  const replay = url.searchParams.get("replay");
  try {
    if (!session_id) {
      const sessions = await steps.recentSessions(gate.auth.org.id, url.searchParams.get("environment_id") || null, 25);
      return NextResponse.json({ sessions: sessions.filter((s: any) => environmentAllowed(gate.auth, s.environment_id)) },
        { headers: { "cache-control": "no-store" } });
    }
    const session = await steps.getSession(session_id, gate.auth.org.id);
    if (!environmentAllowed(gate.auth, session.environment_id)) {
      return NextResponse.json({ error: "credential is not authorised for this environment" }, { status: 403 });
    }
    if (replay) return NextResponse.json(await steps.replaySession(session_id, gate.auth.org.id), { headers: { "cache-control": "no-store" } });
    return NextResponse.json({ session, steps: await steps.listSteps(session_id, gate.auth.org.id) },
      { headers: { "cache-control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ code: error?.code || "STEP_STATE_UNAVAILABLE", error: error?.message || "unavailable" }, { status: statusFor(error) });
  }
}

export async function POST(req: NextRequest) {
  // Governing a step creates a proposal and writes evidence, so it needs write
  // authority — reading a decision does not.
  const gate: any = await integrationAuth(req, "runtime:write");
  if (gate.response) return gate.response;
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON body required" }, { status: 400 }); }
  const org_id = gate.auth.org.id;
  const actor = `api-key:${gate.auth.key_id}`;

  try {
    if (body.operation === "session.open") {
      if (!body.environment_id) return NextResponse.json({ error: "environment_id is required" }, { status: 400 });
      if (!environmentAllowed(gate.auth, body.environment_id)) {
        return NextResponse.json({ error: "credential is not authorised for this environment" }, { status: 403 });
      }
      const session = await steps.openSession({
        org_id, environment_id: body.environment_id, workflow: body.workflow,
        actor, correlation_id: body.correlation_id, domains: body.domains,
        horizon: body.horizon, idempotency_key: body.idempotency_key,
      });
      return NextResponse.json(session, { status: 201, headers: { "cache-control": "no-store" } });
    }

    if (body.operation === "step.evaluate") {
      if (!body.session_id || !body.action_id) {
        return NextResponse.json({ error: "session_id and action_id are required" }, { status: 400 });
      }
      const session = await steps.getSession(body.session_id, org_id);
      if (!environmentAllowed(gate.auth, session.environment_id)) {
        return NextResponse.json({ error: "credential is not authorised for this environment" }, { status: 403 });
      }
      const step = await steps.governStep(String(body.action_id), {
        session_id: body.session_id, org_id, environment_id: session.environment_id,
        actor, params: body.params || {},
      });
      // 200 for a permit, 409 for a refusal: a client that ignores the body
      // still cannot mistake a block for a permit.
      return NextResponse.json({
        ...step,
        reason: step.allowed ? null
          : step.restricted_by_trajectory
            ? "the accumulated workflow trajectory reaches a forbidden state; the step was blocked before execution"
            : (step.decision && step.decision.reason) || `${body.action_id} was not permitted`,
      }, { status: step.allowed ? 200 : 409, headers: { "cache-control": "no-store" } });
    }

    if (body.operation === "session.close") {
      if (!body.session_id) return NextResponse.json({ error: "session_id is required" }, { status: 400 });
      const session = await steps.getSession(body.session_id, org_id);
      if (!environmentAllowed(gate.auth, session.environment_id)) {
        return NextResponse.json({ error: "credential is not authorised for this environment" }, { status: 403 });
      }
      return NextResponse.json(await steps.closeSession(body.session_id, org_id, {
        status: body.status || "completed", summary: body.summary ?? null,
      }), { headers: { "cache-control": "no-store" } });
    }

    return NextResponse.json({ error: "operation must be session.open, step.evaluate or session.close" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ code: error?.code || "STEP_GOVERNANCE_REJECTED", error: error?.message || "step governance rejected" }, { status: statusFor(error) });
  }
}
