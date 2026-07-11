/**
 * Runtime Governance — CUSTOMER notification orchestrator (managed service).
 *
 * Bridges the per-org preference model (lib/runtime/notify.js) to the Resend
 * email infra (lib/email.ts → sendCustomerNotification). Opt-in, per-org,
 * customer-facing — completely separate from the operator OPS alerts.
 *
 * Every customer event points at the org's durable Evidence Hub (one
 * credential-free, revocable link) rather than minting per-message links, so
 * customers keep a single bookmark and there is no customer login anywhere.
 *
 * All functions are best-effort and never throw — a notification failure must
 * never break the operator action (publish / generate / cron) that triggered it.
 */
import * as rt from "@/lib/runtime";
import { sendCustomerNotification } from "@/lib/email";

type Event = "new_evidence" | "executive_report" | "weekly_summary" | "significant_event";

const DEFAULT_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "https://resurrection-tech.com";
const cleanOrigin = (o?: string | null) => (o || DEFAULT_ORIGIN).replace(/\/+$/, "");

/** Copy for each customer event. Returns the subject + in-body heading/body. */
function buildMessage(
  event: Event,
  { orgName, context }: { orgName: string; context?: any },
): { subject: string; heading: string; body: string; ctaLabel: string } {
  const ctx = context || {};
  switch (event) {
    case "new_evidence":
      return {
        subject: `New Runtime Governance evidence — ${orgName} · Resurrection Tech`,
        heading: "New evidence available",
        body:
          `A new Runtime Governance audit pack has been published for ${orgName}.` +
          (ctx.packName ? `\n\nPack: ${ctx.packName}` : "") +
          `\n\nOpen your secure evidence hub to review the latest reports and evidence. No account or password required.`,
        ctaLabel: "Open evidence hub",
      };
    case "executive_report":
      return {
        subject: `Executive report ready — ${orgName} · Resurrection Tech`,
        heading: "Executive report generated",
        body:
          `A new executive Runtime Governance report is ready for ${orgName}.` +
          `\n\nOpen your secure evidence hub to read it and download the branded PDF.`,
        ctaLabel: "Read executive report",
      };
    case "weekly_summary": {
      const s = ctx.summary || {};
      const line =
        typeof s.total === "number"
          ? `\n\nThis week: ${s.total} runtime evaluations` +
            (typeof s.blocked === "number" ? ` · ${s.blocked} catastrophic actions prevented` : "") +
            (typeof s.escalated === "number" ? ` · ${s.escalated} escalated for review` : "") +
            "."
          : "";
      return {
        subject: `Weekly Runtime Governance summary — ${orgName} · Resurrection Tech`,
        heading: "Weekly Runtime Governance summary",
        body:
          `Your weekly Runtime Governance summary for ${orgName}.${line}` +
          `\n\nOpen your secure evidence hub for the full evidence and reports.`,
        ctaLabel: "Open evidence hub",
      };
    }
    case "significant_event":
      return {
        subject: `Significant governance event — ${orgName} · Resurrection Tech`,
        heading: "Significant governance event",
        body:
          (typeof ctx.message === "string" && ctx.message.trim()
            ? ctx.message.trim()
            : `A significant Runtime Governance event has been recorded for ${orgName}.`) +
          `\n\nOpen your secure evidence hub for the supporting evidence.`,
        ctaLabel: "Open evidence hub",
      };
  }
}

/**
 * Deliver a customer event if (and only if) the org opted in to it.
 * Reuses the org's durable Evidence Hub link as the CTA. Best-effort.
 * Returns a small result describing what happened (for API responses/tests).
 */
export async function notifyCustomer(opts: {
  org_id: string;
  event: Event;
  origin?: string | null;
  context?: any;
}): Promise<{ ok: boolean; sent?: boolean; skipped?: string; recipients?: number; error?: string }> {
  const { org_id, event, context } = opts;
  try {
    if (!rt.notify.EVENTS.includes(event)) return { ok: false, error: "unknown event" };
    if (!(await rt.notify.shouldNotify(org_id, event))) return { ok: true, sent: false, skipped: "not opted in" };

    const prefs = await rt.notify.getPrefs(org_id);
    const org = await rt.admin.getOrg(org_id).catch(() => null);
    const orgName: string = org?.name || "your organisation";

    // Reuse (or create) the durable per-customer Evidence Hub link.
    const hub = await rt.hub.createHub({ org_id });
    const ctaUrl = `${cleanOrigin(opts.origin)}${hub.path}`;

    const msg = buildMessage(event, { orgName, context });
    const sent = await sendCustomerNotification({
      to: prefs.recipients,
      subject: msg.subject,
      heading: msg.heading,
      body: msg.body,
      orgName,
      ctaLabel: msg.ctaLabel,
      ctaUrl,
      footerNote: "You are receiving this because your organisation opted in to Runtime Governance updates.",
    });

    await rt.adminaudit
      .record({ action: "customer_notify", target: org_id, meta: { event, recipients: prefs.recipients.length, ok: sent.ok } })
      .catch(() => {});

    if (!sent.ok) return { ok: false, sent: false, recipients: prefs.recipients.length, error: sent.error };
    return { ok: true, sent: true, recipients: prefs.recipients.length };
  } catch (e: any) {
    return { ok: false, error: e?.message || "notify failed" };
  }
}

/**
 * Weekly customer summary sweep — driven by the daily cron on Mondays. Sends a
 * summary to every org opted in to weekly_summary, marking each so a re-run in
 * the same week does not double-send. Best-effort per org.
 */
export async function runWeeklyCustomerSummaries(
  opts: { origin?: string | null } = {},
): Promise<{ ok: boolean; considered: number; sent: number; errors: number }> {
  const out = { ok: true, considered: 0, sent: 0, errors: 0 };
  try {
    const orgIds: string[] = await rt.notify.optedInForWeekly();
    out.considered = orgIds.length;
    for (const org_id of orgIds) {
      try {
        // De-dupe within the same UTC week (cron may fire more than once).
        const prefs = await rt.notify.getPrefs(org_id);
        if (prefs.last_weekly_at && withinDays(prefs.last_weekly_at, 6)) continue;

        const env = (await rt.admin.listEnvironments(org_id).catch(() => []))?.[0] || null;
        const since = new Date(Date.now() - 7 * 864e5).toISOString();
        const summary = await rt.metrics
          .summary({ org_id, environment_id: env?.id, since })
          .catch(() => null);
        const context = summary
          ? { summary: { total: summary.total, blocked: summary.verdicts?.BLOCK, escalated: summary.verdicts?.ESCALATE } }
          : {};

        const r = await notifyCustomer({ org_id, event: "weekly_summary", origin: opts.origin, context });
        if (r.sent) {
          out.sent += 1;
          await rt.notify.markWeekly(org_id).catch(() => {});
        } else if (r.error) {
          out.errors += 1;
        }
      } catch {
        out.errors += 1;
      }
    }
  } catch (e: any) {
    return { ...out, ok: false };
  }
  return out;
}

function withinDays(iso: string, days: number): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && Date.now() - t < days * 864e5;
}
