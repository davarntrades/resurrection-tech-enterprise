/** Runtime Governance — publish an audit pack from a browser upload.
 * multipart/form-data: files[] (the generated deliverables) + org_id +
 * environment_id [+ name] [+ reference]. Replaces the CLI for operators.
 * Auth: operator session OR x-admin-key. */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";
import { notifyCustomer } from "@/lib/customerNotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(req: NextRequest) {
  return rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
}

export async function POST(req: NextRequest) {
  const authz = authorize(req);
  if (!authz.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 }); }
  const org_id = String(form.get("org_id") || "");
  const environment_id = String(form.get("environment_id") || "");
  if (!org_id || !environment_id) return NextResponse.json({ error: "org_id and environment_id required" }, { status: 400 });

  const entries = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!entries.length) return NextResponse.json({ error: "no files uploaded" }, { status: 400 });

  try {
    const files = await Promise.all(entries.map(async (f) => ({ filename: f.name, bytes: Buffer.from(await f.arrayBuffer()), mime: f.type || undefined })));
    const result = await rt.deliverables.publishUploaded({
      org_id, environment_id, name: String(form.get("name") || "") || undefined, reference: String(form.get("reference") || "") || undefined, files,
    });
    await rt.adminaudit.record({ action: "publish_audit", actor: authz.identity, via: authz.via, target: environment_id, meta: { pack_id: result.pack.id, files: result.deliverables.length } });

    // Managed-service: notify opted-in customers that new evidence is available
    // (and, when the pack includes an executive report, that too). Best-effort.
    const origin = req.headers.get("origin") || `https://${req.headers.get("host") || "resurrection-tech.com"}`;
    const hasExec = (result.deliverables || []).some((d: any) => /executive-report\.(pdf|html)$/i.test(d.filename || ""));
    const notified = await notifyCustomer({ org_id, event: "new_evidence", origin, context: { packName: result.pack.name } });
    if (hasExec) await notifyCustomer({ org_id, event: "executive_report", origin, context: { packName: result.pack.name } });

    return NextResponse.json({ ok: true, pack: result.pack, deliverables: result.deliverables.length, customer_notified: !!notified.sent });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "publish failed" }, { status: 500 });
  }
}
