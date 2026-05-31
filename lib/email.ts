import { Resend } from "resend";
import type { AuditRequestInput } from "./validation";

/**
 * Transactional email via Resend.
 * Sends (1) an internal notification and (2) a prospect confirmation.
 * If RESEND_API_KEY is unset, email is skipped gracefully so the
 * submission still persists (useful in local dev).
 */
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

const FROM = process.env.EMAIL_FROM ?? "Resurrection Tech <audit@resurrectiontech.ai>";
const NOTIFY_TO = process.env.AUDIT_NOTIFY_TO ?? "audit@resurrectiontech.ai";

const shell = (inner: string) => `
  <div style="background:#08090b;padding:32px;font-family:'Geist Mono',ui-monospace,monospace;color:#aab2bd">
    <div style="max-width:560px;margin:0 auto;background:#0f1216;border:1px solid rgba(255,255,255,0.08);border-radius:14px;overflow:hidden">
      <div style="padding:22px 28px;border-bottom:1px solid rgba(255,255,255,0.08);color:#f3f5f7;font-size:15px;letter-spacing:0.04em">
        &#8475;(t)&nbsp;&nbsp;Resurrection Tech&trade;
      </div>
      <div style="padding:28px">${inner}</div>
      <div style="padding:18px 28px;border-top:1px solid rgba(255,255,255,0.08);font-size:11px;color:#474e58;letter-spacing:0.1em">
        PATENT GB2600765.8 &middot; MORRISON RUNTIME GOVERNANCE&trade;
      </div>
    </div>
  </div>`;

const row = (k: string, v: string) =>
  `<tr><td style="padding:7px 0;color:#6b7480;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;width:42%">${k}</td><td style="padding:7px 0;color:#f3f5f7;font-size:14px">${v || "—"}</td></tr>`;

export async function sendAuditEmails(data: AuditRequestInput, reference: string) {
  const resend = getResend();
  if (!resend) return { sent: false, reason: "RESEND_API_KEY not configured" };

  const caps = (data.risk_capabilities ?? []).join(", ");
  const sys = (data.ai_system_type ?? []).join(", ");
  const stamp = new Date().toUTCString();

  // 1) Internal notification
  const internal = shell(`
    <div style="color:#6f97ff;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;margin-bottom:14px">New audit request &middot; ${reference}</div>
    <table style="width:100%;border-collapse:collapse">
      ${row("Company", data.company_name)}
      ${row("Industry", data.industry)}
      ${row("Contact", `${data.contact_name} &lt;${data.contact_email}&gt;`)}
      ${row("Phone", data.contact_phone ?? "")}
      ${row("Website", data.website ?? "")}
      ${row("Team size", data.team_size ?? "")}
      ${row("Production status", data.deployment_type ?? "")}
      ${row("System type", sys)}
      ${row("Autonomy level", data.autonomy_level ?? "")}
      ${row("Risk surface", data.risk_summary ?? "")}
      ${row("Capabilities", caps)}
      ${row("Est. investment", data.estimated_investment ?? "")}
      ${row("Submitted", stamp)}
    </table>`);

  // 2) Prospect confirmation
  const confirm = shell(`
    <div style="color:#f3f5f7;font-size:20px;margin-bottom:10px">Audit Request Received&trade;</div>
    <p style="font-size:14px;line-height:1.6;color:#aab2bd;margin:0 0 18px">
      Your organisation has entered the Runtime Governance assessment process. A member of
      Resurrection Tech will review your submission and determine audit suitability.
    </p>
    <table style="width:100%;border-collapse:collapse">
      ${row("Reference", reference)}
      ${row("Organisation", data.company_name)}
      ${row("Risk surface", data.risk_summary ?? "")}
      ${row("Expected response", "1–3 business days")}
    </table>
    <p style="font-size:12px;color:#6b7480;margin:20px 0 0;line-height:1.6">
      Next steps: architecture review &middot; scope confirmation &middot; governance assessment scheduling.
    </p>`);

  const [internalRes, confirmRes] = await Promise.allSettled([
    resend.emails.send({
      from: FROM,
      to: NOTIFY_TO,
      subject: `New Audit Request — ${data.company_name} (${data.risk_summary || "unscored"}) · ${reference}`,
      html: internal,
      replyTo: data.contact_email,
    }),
    resend.emails.send({
      from: FROM,
      to: data.contact_email,
      subject: "Runtime Governance Audit Request Received™",
      html: confirm,
    }),
  ]);

  return {
    sent: internalRes.status === "fulfilled" || confirmRes.status === "fulfilled",
    internal: internalRes.status,
    confirm: confirmRes.status,
  };
}
