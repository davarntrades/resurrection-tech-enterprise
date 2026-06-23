import { Resend } from "resend";
import type { AuditRequestInput } from "./validation";
import type { LeadInput } from "./leadValidation";
import type { AssessmentData, Recommendation, Scores } from "./assessment";
import {
  crmSummary, labelsFor, TOOL_ACCESS, CONTROLS, COMPLIANCE, SUCCESS_CRITERIA, STAGES,
  ENGAGEMENT_INTENTS, PARTNER_TYPES, CUSTOMER_REACH, isPartnerPathway,
} from "./assessment";
import { referralPath } from "./referral";

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

const FROM = process.env.EMAIL_FROM ?? "Resurrection Tech <hello@resurrection-tech.com>";
const NOTIFY_TO = process.env.AUDIT_NOTIFY_TO ?? "hello@resurrection-tech.com";
const LEAD_NOTIFY_TO = process.env.LEAD_NOTIFY_TO ?? NOTIFY_TO;
// Runtime Governance Assessment notifications route to the team inbox.
const ASSESSMENT_NOTIFY_TO = process.env.ASSESSMENT_NOTIFY_TO ?? "hello@resurrection-tech.com";

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

/** Escape user-supplied text before embedding it in HTML email bodies. */
const esc = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

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

  // resend.emails.send resolves with { data, error } (it does not reject), so a
  // "fulfilled" promise can still carry a delivery error. Inspect the actual error.
  const internalErr = internalRes.status === "rejected"
    ? String(internalRes.reason)
    : internalRes.value?.error?.message;
  const confirmErr = confirmRes.status === "rejected"
    ? String(confirmRes.reason)
    : confirmRes.value?.error?.message;
  if (internalErr) console.error("[audit] resend internal error:", internalErr);
  if (confirmErr) console.error("[audit] resend confirm error:", confirmErr);

  return {
    sent: !internalErr, // the internal team notification is the one that must land
    reason: internalErr || confirmErr,
    internal: !internalErr,
    confirm: !confirmErr,
  };
}

/**
 * Notify the team of a new enterprise lead. Skipped gracefully when
 * RESEND_API_KEY is unset, so the submission still succeeds.
 */
export async function sendLeadEmail(data: LeadInput, reference: string) {
  const resend = getResend();
  if (!resend) return { sent: false, reason: "RESEND_API_KEY not configured" };

  const stamp = new Date().toUTCString();
  const internal = shell(`
    <div style="color:#6f97ff;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;margin-bottom:14px">New enterprise lead &middot; ${reference}</div>
    <table style="width:100%;border-collapse:collapse">
      ${row("Name", data.name)}
      ${row("Organisation", data.organisation ?? "")}
      ${row("Email", data.email)}
      ${row("Role", data.role ?? "")}
      ${row("Use case", data.use_case ?? "")}
      ${row("Source", data.source ?? "")}
      ${row("Submitted", stamp)}
    </table>
    ${
      data.message
        ? `<div style="margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08)">
             <div style="color:#6b7480;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px">Message</div>
             <p style="font-size:14px;line-height:1.6;color:#f3f5f7;margin:0;white-space:pre-wrap">${data.message}</p>
           </div>`
        : ""
    }`);

  // 2) Prospect-facing report — sent to the address they submitted. This is the
  //    "We'll email your full report" the /assess form promises. Includes their
  //    Ω exposure summary (data.message) when present, plus next steps.
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://resurrection-tech.com";
  const btn = (href: string, label: string) =>
    `<a href="${href}" style="display:inline-block;background:#6f97ff;color:#08090b;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:10px">${label}</a>`;
  const prospectHtml = shell(`
    <div style="color:#f3f5f7;font-size:20px;margin-bottom:10px">Your Runtime Governance Assessment</div>
    <p style="font-size:14px;line-height:1.6;color:#aab2bd;margin:0 0 18px">
      Hi ${data.name || "there"} — thanks for assessing your agent with Resurrection Tech.
      Here is your Ω exposure summary. Nothing in your manifest was ever executed.
    </p>
    ${
      data.message
        ? `<div style="margin:0 0 18px;padding:16px;background:#0b0d11;border:1px solid rgba(255,255,255,0.08);border-radius:10px">
             <div style="color:#6b7480;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px">Your Ω exposure summary</div>
             <p style="font-size:13px;line-height:1.65;color:#e7ecf3;margin:0;white-space:pre-wrap">${data.message}</p>
           </div>`
        : ""
    }
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px">
      ${row("Reference", reference)}
      ${row("Next step", "A scoped, fixed-fee pilot that governs your agent before execution")}
    </table>
    <div style="margin:0 0 18px">${btn(`${site}/pilot`, "See the pilot scope →")}&nbsp;&nbsp;${btn(`${site}/book#assessment`, "Book a call →")}</div>
    <p style="font-size:12px;color:#6b7480;margin:0;line-height:1.6">
      The pilot loads your Ω registry, runs your corpus to 0 false-positives / 0 false-negatives,
      and replays every verdict with an attestation. Reply to this email to talk to the team.
    </p>`);

  const [internalRes, prospectRes] = await Promise.allSettled([
    resend.emails.send({
      from: FROM,
      to: LEAD_NOTIFY_TO,
      subject: `New Lead — ${data.name}${data.organisation ? ` · ${data.organisation}` : ""} (${reference})`,
      html: internal,
      replyTo: data.email,
    }),
    resend.emails.send({
      from: FROM,
      to: data.email,
      subject: "Your Runtime Governance Assessment — Resurrection Tech",
      html: prospectHtml,
      replyTo: LEAD_NOTIFY_TO,
    }),
  ]);

  const internalErr = internalRes.status === "rejected"
    ? String(internalRes.reason) : internalRes.value?.error?.message;
  const prospectErr = prospectRes.status === "rejected"
    ? String(prospectRes.reason) : prospectRes.value?.error?.message;
  if (internalErr) console.error("[lead] resend internal error:", internalErr);
  if (prospectErr) console.error("[lead] resend prospect error:", prospectErr);

  return {
    sent: !internalErr,                 // internal team notification (drives the funnel gate)
    reason: internalErr || prospectErr,
    prospect_sent: !prospectErr,        // prospect-facing report to the submitted address
    prospect_reason: prospectErr,
  };
}

/** Exact HTML for the internal assessment report (also used for previews/tests). */
export function buildAssessmentInternalHtml(
  d: AssessmentData, s: Scores, rec: Recommendation, reference: string, stamp: string,
): string {
  const yn = (v: string) => (v === "yes" ? "Yes" : v === "no" ? "No" : "—");
  const list = (vals: string[], opts: Parameters<typeof labelsFor>[0]) =>
    vals?.length ? labelsFor(opts, vals).join(", ") : "—";
  const stageLabel = STAGES.find((x) => x.value === d.stage)?.label ?? "—";
  const one = (val: string, opts: { value: string; label: string }[]) =>
    opts.find((o) => o.value === val)?.label ?? (val || "—");
  const crm = crmSummary(d, s, rec, reference, stamp);
  const partner = isPartnerPathway(rec.id);
  const partnerBanner = partner
    ? `<div style="margin:0 0 16px;padding:14px 16px;background:#2a1a0b;border:1px solid #e0a93f;border-radius:10px">
         <div style="color:#e0a93f;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;margin-bottom:8px">⚑ Partnership / channel / licensing candidate</div>
         <table style="width:100%;border-collapse:collapse">
           ${row("Engagement reason", esc(one(d.intent, ENGAGEMENT_INTENTS)))}
           ${row("Company type", esc(one(d.partnerType, PARTNER_TYPES)))}
           ${row("Estimated customer reach", esc(one(d.customerReach, CUSTOMER_REACH)))}
           ${row("Customer base", esc(d.customerBase))}
         </table>
       </div>`
    : "";
  return shell(`
    <div style="color:#6f97ff;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;margin-bottom:14px">Runtime Governance Assessment &middot; ${reference}</div>
    ${partnerBanner}
    <div style="margin:0 0 16px;padding:14px 16px;background:#0b0d11;border:1px solid rgba(111,151,255,0.3);border-radius:10px">
      <div style="color:#6b7480;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px">Recommended pathway</div>
      <div style="color:#f3f5f7;font-size:16px;font-weight:600">${rec.title}</div>
      <div style="color:#aab2bd;font-size:13px;margin-top:4px">${rec.tagline}</div>
    </div>
    <div style="margin:0 0 16px;padding:14px 16px;background:#0b0d11;border:1px solid rgba(255,255,255,0.08);border-radius:10px">
      <div style="color:#6b7480;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px">Referral attribution</div>
      <table style="width:100%;border-collapse:collapse">
        ${row("Referral source", d.referralSource || "Direct / Unknown")}
        ${row("Referral code", d.referralCode || "—")}
        ${row("Referral link", d.referralCode ? referralPath(d.referralCode) : "—")}
        ${row("Recommended pathway", rec.title)}
        ${row("Reference", reference)}
      </table>
    </div>
    <table style="width:100%;border-collapse:collapse">
      ${row("Maturity score", `${s.maturity}/100 (${s.maturityBand})`)}
      ${row("Complexity score", `${s.complexity}/100`)}
      ${row("Ω exposure score", `${s.exposure}/100 (${s.exposureBand})`)}
    </table>
    <div style="height:14px"></div>
    <table style="width:100%;border-collapse:collapse">
      ${row("Company", d.companyName)}
      ${row("Contact", `${d.fullName} &middot; ${d.jobTitle}`)}
      ${row("Email", d.email)}
      ${row("Phone", d.phone)}
      ${row("Industry", d.industry)}
      ${row("Company size", d.companySize)}
      ${row("Country", d.country)}
      ${row("Stage", stageLabel)}
      ${row("In production", yn(d.inProduction))}
      ${row("Customer-facing", yn(d.customerFacing))}
      ${row("Connected to tools", yn(d.connectedToTools))}
      ${row("Can take actions", yn(d.canTakeActions))}
      ${row("Multiple agents", yn(d.multipleAgents))}
      ${row("Number of agents", d.numAgents)}
      ${row("Tool access", list(d.toolAccess, TOOL_ACCESS))}
      ${row("Controls", list(d.controls, CONTROLS))}
      ${row("Compliance", list(d.compliance, COMPLIANCE))}
      ${row("Success criteria", list(d.successCriteria, SUCCESS_CRITERIA))}
      ${row("Submitted", stamp)}
    </table>
    ${d.unsafePrevention ? `<div style="margin-top:16px"><div style="color:#6b7480;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px">How unsafe actions are prevented</div><p style="font-size:13px;line-height:1.6;color:#f3f5f7;margin:0;white-space:pre-wrap">${esc(d.unsafePrevention)}</p></div>` : ""}
    ${d.incidents ? `<div style="margin-top:14px"><div style="color:#6b7480;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px">Incidents / near misses</div><p style="font-size:13px;line-height:1.6;color:#f3f5f7;margin:0;white-space:pre-wrap">${esc(d.incidents)}</p></div>` : ""}
    ${d.successNotes ? `<div style="margin-top:14px"><div style="color:#6b7480;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px">Success notes</div><p style="font-size:13px;line-height:1.6;color:#f3f5f7;margin:0;white-space:pre-wrap">${esc(d.successNotes)}</p></div>` : ""}
    <div style="margin-top:18px">
      <div style="color:#6b7480;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px">CRM export (copy/paste)</div>
      <pre style="font-size:11px;line-height:1.5;color:#cdd6e0;background:#0a0c0f;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;white-space:pre-wrap;overflow-x:auto">${esc(crm)}</pre>
    </div>`);
}

/** Exact HTML for the prospect confirmation (no internal scores). */
export function buildAssessmentConfirmHtml(
  d: AssessmentData, rec: Recommendation, reference: string, stamp: string,
): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://resurrection-tech.com";
  const btn = (href: string, label: string) =>
    `<a href="${href}" style="display:inline-block;background:#6f97ff;color:#08090b;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:10px">${label}</a>`;
  return shell(`
    <div style="color:#f3f5f7;font-size:20px;margin-bottom:10px">Your Runtime Governance Assessment</div>
    <p style="font-size:14px;line-height:1.6;color:#aab2bd;margin:0 0 18px">
      Hi ${esc(d.fullName) || "there"} — thanks for completing the assessment for ${esc(d.companyName) || "your team"}.
      Based on your answers, here is the engagement pathway we recommend.
    </p>
    <div style="margin:0 0 18px;padding:16px;background:#0b0d11;border:1px solid rgba(111,151,255,0.3);border-radius:10px">
      <div style="color:#6b7480;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px">Recommended pathway</div>
      <div style="color:#f3f5f7;font-size:17px;font-weight:600">${rec.title}</div>
      <div style="color:#aab2bd;font-size:13px;margin-top:4px">${rec.tagline}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px">
      ${row("Reference", reference)}
      ${row("Submitted", stamp)}
      ${row("Expected response", "1–3 business days")}
    </table>
    <div style="margin:0 0 18px">${btn(`${site}${rec.ctaHref}`, `${rec.ctaLabel} →`)}&nbsp;&nbsp;${btn(`${site}/book#assessment`, "Book a call →")}</div>
    <p style="font-size:12px;color:#6b7480;margin:0;line-height:1.6">
      A member of Resurrection Tech will review your assessment and follow up. Reply to this email to reach the team directly.
    </p>`);
}

/**
 * Runtime Governance Assessment emails:
 *   1) Internal structured report (scores + CRM-paste block) to the team.
 *   2) Prospect confirmation with the recommended pathway (no internal scores).
 * Skipped gracefully when RESEND_API_KEY is unset.
 */
export async function sendAssessmentEmails(
  d: AssessmentData, s: Scores, rec: Recommendation, reference: string,
) {
  const resend = getResend();
  if (!resend) return { sent: false, reason: "RESEND_API_KEY not configured" };

  const stamp = new Date().toUTCString();
  const internal = buildAssessmentInternalHtml(d, s, rec, reference, stamp);
  const confirm = buildAssessmentConfirmHtml(d, rec, reference, stamp);
  const flag = isPartnerPathway(rec.id) ? "[PARTNER/CHANNEL/LICENSING] " : "";

  const [internalRes, confirmRes] = await Promise.allSettled([
    resend.emails.send({
      from: FROM,
      to: ASSESSMENT_NOTIFY_TO,
      subject: `${flag}Assessment — ${d.companyName} → ${rec.title} (Ω ${s.exposure}/${s.exposureBand}) · ${reference}`,
      html: internal,
      replyTo: d.email,
    }),
    resend.emails.send({
      from: FROM,
      to: d.email,
      subject: "Your Runtime Governance Assessment — Resurrection Tech™",
      html: confirm,
      replyTo: ASSESSMENT_NOTIFY_TO,
    }),
  ]);

  const internalErr = internalRes.status === "rejected"
    ? String(internalRes.reason) : internalRes.value?.error?.message;
  const confirmErr = confirmRes.status === "rejected"
    ? String(confirmRes.reason) : confirmRes.value?.error?.message;
  if (internalErr) console.error("[assessment] resend internal error:", internalErr);
  if (confirmErr) console.error("[assessment] resend confirm error:", confirmErr);

  return { sent: !internalErr, reason: internalErr || confirmErr, confirm_sent: !confirmErr };
}
