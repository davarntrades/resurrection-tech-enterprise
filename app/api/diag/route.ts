import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TEMPORARY diagnostic — confirms the *running* production build is reading the
 * current environment variables (not stale values from an old deployment).
 *
 * Safe to expose: notify addresses are masked, EMAIL_FROM is public (it's in
 * every email header), and the Resend key is reported only as present + length
 * (never the value). Remove this route once delivery is confirmed.
 */
function maskEmail(v: string | undefined): string {
  if (!v) return "(unset)";
  const m = v.match(/<([^>]+)>/); // handle "Name <addr>"
  const addr = m ? m[1] : v;
  const at = addr.indexOf("@");
  if (at < 1) return v;
  const local = addr.slice(0, at);
  const shown = local.slice(0, 2);
  return `${shown}${"*".repeat(Math.max(1, local.length - 2))}@${addr.slice(at + 1)}`;
}

export function GET() {
  const key = process.env.RESEND_API_KEY ?? "";
  const EMAIL_FROM_default = "Resurrection Tech <hello@resurrection-tech.com>";
  const AUDIT_NOTIFY_default = "hello@resurrection-tech.com";

  return NextResponse.json({
    ok: true,
    note: "Effective runtime values seen by THIS deployment. Notify addresses masked; key shown as present/length only.",
    runtime: {
      vercel_env: process.env.VERCEL_ENV ?? "(local/unknown)",
      git_sha: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "(none)",
      git_ref: process.env.VERCEL_GIT_COMMIT_REF ?? "(none)",
      node_env: process.env.NODE_ENV,
      built_at: process.env.VERCEL_DEPLOYMENT_ID ? "vercel" : "unknown",
    },
    email: {
      // EMAIL_FROM is public (sender header) — shown in full so you can confirm
      // it's onboarding@resend.dev (sandbox) vs your verified domain.
      EMAIL_FROM: process.env.EMAIL_FROM ?? `(unset → default: ${EMAIL_FROM_default})`,
      LEAD_NOTIFY_TO: maskEmail(process.env.LEAD_NOTIFY_TO),
      AUDIT_NOTIFY_TO: maskEmail(process.env.AUDIT_NOTIFY_TO ?? AUDIT_NOTIFY_default),
      LEAD_NOTIFY_TO_set: Boolean(process.env.LEAD_NOTIFY_TO),
      AUDIT_NOTIFY_TO_set: Boolean(process.env.AUDIT_NOTIFY_TO),
      RESEND_API_KEY_present: Boolean(key),
      RESEND_API_KEY_prefix_ok: key.startsWith("re_"),
      RESEND_API_KEY_length: key.length,
    },
    supabase_configured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  });
}
