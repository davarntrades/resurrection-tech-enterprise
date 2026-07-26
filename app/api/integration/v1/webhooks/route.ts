import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import { environmentAllowed, integrationAuth, proposalResponse } from "@/lib/integration-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate: any = await integrationAuth(req, "webhooks:read");
  if (gate.response) return gate.response;
  const sp = new URL(req.url).searchParams;
  const [webhooks, deliveries] = await Promise.all([
    (rt.integrationGateway as any).listWebhooks(gate.auth.org.id),
    (rt.integrationGateway as any).listDeliveries(gate.auth.org.id, sp.get("webhook_id") || null),
  ]);
  const allowedHooks = webhooks.filter((w: any) => environmentAllowed(gate.auth, w.environment_id));
  const allowedIds = new Set(allowedHooks.map((w: any) => w.id));
  return NextResponse.json({ webhooks: allowedHooks, deliveries: deliveries.filter((d: any) => allowedIds.has(d.webhook_id)) });
}

export async function POST(req: NextRequest) {
  const gate: any = await integrationAuth(req, "webhooks:manage");
  if (gate.response) return gate.response;
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON body required" }, { status: 400 }); }
  if (["pause", "resume", "revoke"].includes(body.operation)) {
    const row = await rt.store.findOne("integration_webhooks", { id: body.webhook_id });
    if (!row || row.org_id !== gate.auth.org.id || !environmentAllowed(gate.auth, row.environment_id))
      return NextResponse.json({ error: "webhook not found" }, { status: 404 });
    const proposal = await (rt.integrationGateway as any).governed("manage_integration_webhook", {
      org_id: gate.auth.org.id, environment_id: row.environment_id, actor: `api-key:${gate.auth.key_id}`,
      params: { webhook_id: row.id, status: body.operation === "resume" ? "active" : body.operation === "pause" ? "paused" : "revoked" },
    });
    return proposalResponse(proposal);
  }
  if (body.operation === "replay" || body.operation === "retry") {
    if (!body.delivery_id) return NextResponse.json({ error: "delivery_id required" }, { status: 400 });
    const prior = await rt.store.findOne("integration_webhook_deliveries", { id: body.delivery_id });
    if (!prior || prior.org_id !== gate.auth.org.id || !environmentAllowed(gate.auth, prior.environment_id))
      return NextResponse.json({ error: "delivery not found" }, { status: 404 });
    try {
      const proposal = await (rt.integrationGateway as any).replayDelivery({
        org_id: gate.auth.org.id, delivery_id: body.delivery_id, actor: `api-key:${gate.auth.key_id}`,
      });
      return proposalResponse(proposal);
    } catch (e: any) { return NextResponse.json({ error: e?.message || "delivery replay failed" }, { status: 400 }); }
  }
  if (!body.url || !body.environment_id) return NextResponse.json({ error: "url and environment_id are required" }, { status: 400 });
  if (!environmentAllowed(gate.auth, body.environment_id)) return NextResponse.json({ error: "credential is not authorised for this environment" }, { status: 403 });
  try {
    const signing_secret = crypto.randomBytes(32).toString("hex");
    const secret_ref = await (rt.integrationGateway as any).stageSecret(gate.auth.org.id, { secret: signing_secret }, "webhook-signing");
    const proposal = await (rt.integrationGateway as any).governed("register_integration_webhook", {
      org_id: gate.auth.org.id, environment_id: body.environment_id, actor: `api-key:${gate.auth.key_id}`,
      params: { url: body.url, name: body.name, events: body.events, capture_payloads: !!body.capture_payloads, secret_ref },
    });
    return proposalResponse(proposal, (rt.integrationGateway as any).executed(proposal) ? { signing_secret, secret_notice: "Shown once. Store it securely." } : {});
  } catch (e: any) { return NextResponse.json({ error: e?.message || "webhook registration failed" }, { status: 400 }); }
}
