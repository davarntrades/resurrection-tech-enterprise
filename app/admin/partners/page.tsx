import type { Metadata } from "next";
import Link from "next/link";
import { getReferralSummary, getReferrerEmails } from "@/lib/assessmentsStore";
import { partnerUrl, partnerLinksEnabled } from "@/lib/partnerToken";
import { SITE } from "@/lib/site";
import { CopyButton } from "@/components/CopyButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Partners — Admin",
  robots: { index: false, follow: false },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

export default async function Page() {
  const [summary, emails] = await Promise.all([getReferralSummary(), getReferrerEmails()]);
  const linksOn = partnerLinksEnabled();

  return (
    <main className="adm">
      <header className="adm-head">
        <div>
          <span className="adm-eyebrow">Resurrection Tech™ · internal</span>
          <h1>Partner dashboard</h1>
        </div>
        <span className="adm-count">
          {summary.ok ? `${summary.rows.length} ${summary.rows.length === 1 ? "source" : "sources"}` : "—"}
        </span>
      </header>

      <p className="adm-section-sub">
        Per-referrer performance from the live <code>referral_summary</code> view. Stage counts reflect
        pipeline status; read-only. Share a partner-facing link to give a referrer visibility into
        their own numbers — they only ever see their own. <Link href="/admin/leads">View all leads →</Link>
      </p>

      {!summary.ok && (
        <div className="adm-note">
          Persistence not available: {summary.error} Once the <code>assessments</code> table and{" "}
          <code>referral_summary</code> view exist and Supabase env vars are set, partner metrics
          appear here.
        </div>
      )}

      {summary.ok && summary.rows.length === 0 && (
        <div className="adm-note">No referral data yet. Generate a link at <code>/referral</code>.</div>
      )}

      {summary.ok && summary.rows.length > 0 && (
        <div className="adm-tablewrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Referral source</th>
                <th>Code</th>
                <th>Referrer email</th>
                <th>Leads</th>
                <th>Workshops</th>
                <th>Audits</th>
                <th>Pilots</th>
                <th>Integrations</th>
                <th>Won</th>
                <th>Lost</th>
                <th>Last lead</th>
                <th>Partner link</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((r) => {
                const isDirect = !r.referral_code || r.referral_code === "direct";
                const link = !isDirect && linksOn ? partnerUrl(r.referral_code, SITE.url) : null;
                return (
                  <tr key={r.referral_code + r.referral_source}>
                    <td className="adm-strong">{r.referral_source}</td>
                    <td className="adm-mono">{r.referral_code}</td>
                    <td className="adm-mono">{emails[r.referral_code] ?? <span className="adm-sub">—</span>}</td>
                    <td className="adm-num adm-strong">{r.leads}</td>
                    <td className="adm-num">{r.workshops}</td>
                    <td className="adm-num">{r.audits}</td>
                    <td className="adm-num">{r.pilots}</td>
                    <td className="adm-num">{r.integrations}</td>
                    <td className="adm-num">{r.won}</td>
                    <td className="adm-num">{r.lost}</td>
                    <td className="adm-mono">{fmtDate(r.last_lead_at)}</td>
                    <td>
                      {link ? (
                        <CopyButton value={link} label="Copy link" copiedLabel="Copied ✓" />
                      ) : isDirect ? (
                        <span className="adm-sub">— direct —</span>
                      ) : (
                        <span className="adm-sub">set PARTNER_LINK_SECRET</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {summary.ok && summary.rows.length > 0 && !linksOn && (
        <div className="adm-note">
          Shareable partner links are disabled. Set <code>PARTNER_LINK_SECRET</code> in the environment
          to generate signed, per-partner links that expose only that partner&rsquo;s own statistics.
        </div>
      )}

      <p className="adm-foot">
        Visibility &amp; transparency only — no commission, payments, or partner accounts. Each shared
        link is signed so a partner can never view another partner&rsquo;s data.
      </p>
    </main>
  );
}
