/** Guardian OS — Sovereign Intelligence Packs (Phase 7).
 *
 * Sovereign packs are specialised intelligence for organisations whose mission,
 * regulation or operating environment requires sovereign AI. They install onto
 * the SAME Guardian OS, the SAME Runtime Governance kernel and the SAME Digital
 * Twin as every other Intelligence Pack — the architecture does not change.
 *
 *   GET                          the sovereign catalog + this deployment's posture
 *   GET ?view=classifications    the classification tiers and their derived
 *                                eligible deployment profiles
 *   GET ?view=posture            what THIS deployment is able to host
 *   GET ?view=pack&pack=…        one pack's full declarative intelligence
 *   GET ?view=dashboard&pack=…&org_id=…   a pack's sovereign dashboard
 *     (operator session/admin key, or client key with `status` scope — read-only)
 *
 * INSTALLATION IS DELIBERATELY NOT HERE. Installing a pack is a write to
 * governed configuration, and on a sovereign or air-gapped deployment the
 * immutable runtime refuses it over the network by design — a pack arrives on
 * signed media, verified at the console:
 *
 *     guardian pack install ./national-security.pack --org ORG
 *
 * On a mutable deployment the existing operator route (/api/ops/industry) still
 * installs any pack, sovereign ones included, through the same governed
 * lifecycle — and the admissibility gate refuses one the deployment cannot
 * host. There is no sovereign-specific install path, because there is no
 * sovereign-specific platform.
 */
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

  const I: any = ops.industry;
  const S: any = ops.sovereignty;
  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "";
  const org_id = url.searchParams.get("org_id") || "";
  const pack = url.searchParams.get("pack") || "";
  // A profile may be named to answer "what COULD we host if we deployed there?"
  // — a question a buyer asks long before they have a sovereign deployment.
  const profile = url.searchParams.get("profile") || null;

  try {
    if (view === "classifications") return NextResponse.json({ classifications: S.list() });
    if (view === "posture") return NextResponse.json({ posture: S.posture(profile) });

    if (view === "pack") {
      const sovRegistry = require("@/lib/ops/packs/sovereign");
      const p = sovRegistry.get(pack);
      if (!p) return NextResponse.json({ error: "unknown sovereign pack" }, { status: 404 });
      return NextResponse.json({
        pack: sovRegistry.declarative(p),
        meta: sovRegistry.meta(p),
        admissibility: S.assessPack(p, { profile }),
      });
    }

    if (view === "dashboard") {
      const dashboard = await I.dashboard(org_id, pack);
      if (!dashboard) return NextResponse.json({ error: "unknown pack or enterprise" }, { status: 404 });
      return NextResponse.json({ dashboard });
    }

    return NextResponse.json({
      catalog: I.sovereignCatalog({ profile }),
      posture: S.posture(profile),
      classifications: S.list(),
      installed: org_id ? (await I.installed(org_id)).filter((r: any) => I.SOVEREIGN_PACK_IDS.includes(r.pack_id)) : [],
      // Stated plainly, because it is the product claim: one kernel, one twin,
      // one platform — the deployment profile decides where it runs, the packs
      // decide what it knows.
      invariants: {
        kernel: "unchanged — sovereign packs add Ω policies within the kernel's existing domain vocabulary",
        twin: "one governed Digital Twin; sovereign packs project over it, never beside it",
        code: "sovereign packs are declarative data and carry no executable runtime code",
        install: "signed media only where the runtime is immutable",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "sovereign pack read failed" }, { status: 400 });
  }
}
