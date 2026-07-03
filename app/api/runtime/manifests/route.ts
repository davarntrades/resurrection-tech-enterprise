/** Runtime Governance — continuous manifest management.
 * GET  → current version (?history for full history)
 * POST → upload/version a manifest (detects change, re-assesses, keeps history) */
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bearer = (req: NextRequest) => (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
const envId = (auth: any, req: NextRequest) =>
  auth.environment ? auth.environment.id : new URL(req.url).searchParams.get("environment_id") || undefined;

export async function GET(req: NextRequest) {
  const auth = await rt.admin.authenticate(bearer(req));
  if (!auth) return NextResponse.json({ error: "valid API key required" }, { status: 401 });
  const environment_id = envId(auth, req);
  if (new URL(req.url).searchParams.get("history") != null)
    return NextResponse.json(await rt.manifests.manifestHistory(environment_id));
  return NextResponse.json((await rt.manifests.currentManifest(environment_id)) || { error: "no manifest yet" });
}

export async function POST(req: NextRequest) {
  const auth = await rt.admin.authenticate(bearer(req));
  if (!auth) return NextResponse.json({ error: "valid API key required" }, { status: 401 });
  if (auth.role === "viewer") return NextResponse.json({ error: "ingest or admin role required" }, { status: 403 });
  let body: any = {}; try { body = await req.json(); } catch { /* empty */ }
  const result = await rt.manifests.putManifest({
    org_id: auth.org.id, environment_id: envId(auth, req),
    manifest: body.manifest, domains: body.domains, note: body.note, reassess: body.reassess !== false,
  });
  return NextResponse.json(result);
}
