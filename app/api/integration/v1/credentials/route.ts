import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import { environmentAllowed, integrationAuth } from "@/lib/integration-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate: any = await integrationAuth(req, "credentials:read");
  if (gate.response) return gate.response;
  const credentials = await rt.admin.listApiKeys(gate.auth.org.id);
  return NextResponse.json({ credentials: credentials.filter((k: any) => !k.environment_id || environmentAllowed(gate.auth, k.environment_id)) });
}

export async function POST(req: NextRequest) {
  const gate: any = await integrationAuth(req, "credentials:manage");
  if (gate.response) return gate.response;
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON body required" }, { status: 400 }); }
  const operation = String(body.operation || "issue");
  if (body.environment_id && !environmentAllowed(gate.auth, body.environment_id))
    return NextResponse.json({ error: "credential is not authorised for this environment" }, { status: 403 });
  if (!(rt.integrationGateway as any).canDelegateScopes(gate.auth, body.scopes || []))
    return NextResponse.json({ error: "cannot grant scopes the calling credential does not possess" }, { status: 403 });
  if (["rotate", "revoke"].includes(operation)) {
    if (!body.key_id) return NextResponse.json({ error: "key_id required" }, { status: 400 });
    const target = await rt.store.findOne("api_keys", { id: body.key_id });
    if (!target || target.org_id !== gate.auth.org.id) return NextResponse.json({ error: "credential not found" }, { status: 404 });
    if (target.environment_id && !environmentAllowed(gate.auth, target.environment_id))
      return NextResponse.json({ error: "credential is not authorised for this environment" }, { status: 403 });
  }
  const action = operation === "rotate" ? "rotate_integration_credential" : operation === "revoke" ? "revoke_integration_credential" : "issue_integration_credential";
  try {
    const proposal: any = await (rt.integrationGateway as any).governed(action, {
      org_id: gate.auth.org.id, environment_id: body.environment_id || null, actor: `api-key:${gate.auth.key_id}`,
      params: { key_id: body.key_id || null },
    });
    if (!(rt.integrationGateway as any).executed(proposal))
      return NextResponse.json({ ok: false, governance: { proposal_id: proposal.id, evidence_id: proposal.evidence_id, status: proposal.status }, error: proposal.status === "escalated" ? "operation awaits governed approval" : proposal.decision?.reason || "blocked" }, { status: proposal.status === "escalated" ? 202 : 403 });

    if (operation === "revoke") {
      const target = await rt.store.findOne("api_keys", { id: body.key_id });
      if (!target || target.org_id !== gate.auth.org.id) return NextResponse.json({ error: "credential not found" }, { status: 404 });
      await rt.admin.revokeApiKey(body.key_id);
      await rt.adminaudit.record({ action: "integration_revoke_key", actor: `api-key:${gate.auth.key_id}`, via: "integration-gateway", target: gate.auth.org.id, meta: { key_id: body.key_id, proposal_id: proposal.id } });
      return NextResponse.json({ ok: true, revoked: body.key_id, governance: { proposal_id: proposal.id, evidence_id: proposal.evidence_id } });
    }
    const options = {
      role: body.role || (operation === "issue" ? "ingest" : undefined),
      label: body.label || (operation === "issue" ? "integration credential" : undefined),
      scopes: body.scopes || null, expires_at: body.expires_at || null,
      environment_restrictions: body.environment_restrictions || null,
    };
    const issued = operation === "rotate"
      ? await rt.admin.rotateApiKey(body.key_id, options)
      : await rt.admin.issueApiKey({ org_id: gate.auth.org.id, environment_id: body.environment_id || null, ...options });
    await rt.adminaudit.record({ action: operation === "rotate" ? "integration_rotate_key" : "integration_issue_key", actor: `api-key:${gate.auth.key_id}`, via: "integration-gateway", target: gate.auth.org.id, meta: { credential_id: issued.record.id, proposal_id: proposal.id } });
    return NextResponse.json({
      ok: true, credential: issued.record, key: issued.key,
      key_notice: "Shown once. GuardianOS stores only its hash.",
      governance: { proposal_id: proposal.id, evidence_id: proposal.evidence_id },
    });
  } catch (e: any) { return NextResponse.json({ error: e?.message || "credential operation failed" }, { status: 400 }); }
}
