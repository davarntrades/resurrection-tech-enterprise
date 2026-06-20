import type { Metadata } from "next";
import { getLeads, getReferralSummary } from "@/lib/assessmentsStore";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Leads — Admin",
  robots: { index: false, follow: false },
};

const PATHWAY_LABEL: Record<string, string> = {
  workshop: "Discovery Workshop",
  audit: "48-Hour Audit",
  pilot: "Limited Pilot",
  integration: "Enterprise Integration",
};

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
}

export default async function Page() {
  const [leads, summary] = await Promise.all([getLeads(), getReferralSummary()]);

  return (
    <main className="adm">
      <header className="adm-head">
        <div>
          <span className="adm-eyebrow">Resurrection Tech™ · internal</span>
          <h1>Assessment leads</h1>
        </div>
        <span className="adm-count">{leads.ok ? `${leads.rows.length} leads` : "—"}</span>
      </header>

      {!leads.ok && (
        <div className="adm-note">
          Persistence not available: {leads.error} Once the <code>assessments</code> table exists and
          Supabase env vars are set, leads will appear here.
        </div>
      )}

      {leads.ok && leads.rows.length === 0 && (
        <div className="adm-note">No assessments stored yet. Complete one at <code>/assessment</code>.</div>
      )}

      {leads.ok && leads.rows.length > 0 && (
        <div className="adm-tablewrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Reference</th><th>Company</th><th>Recommended pathway</th>
                <th>Referral source</th><th>Status</th><th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {leads.rows.map((r) => (
                <tr key={r.reference}>
                  <td className="adm-mono">{r.reference}</td>
                  <td>{r.company}<span className="adm-sub">{r.contact_name} · {r.contact_email}</span></td>
                  <td>{PATHWAY_LABEL[r.recommended_pathway] ?? r.recommended_pathway ?? "—"}</td>
                  <td>{r.referral_source}{r.referral_code ? <span className="adm-sub adm-mono">{r.referral_code}</span> : null}</td>
                  <td><span className={`adm-status s-${(r.status || "").toLowerCase().replace(/\s+/g, "-")}`}>{r.status}</span></td>
                  <td className="adm-mono">{fmtDate(r.submitted_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="adm-section">
        <h2>Referral analytics</h2>
        <p className="adm-section-sub">Per-source rollup (partner-reporting foundation). Stage counts reflect pipeline status; “Rec.” columns reflect the recommended pathway at submission.</p>
        {!summary.ok && <div className="adm-note">{summary.error}</div>}
        {summary.ok && summary.rows.length === 0 && <div className="adm-note">No referral data yet.</div>}
        {summary.ok && summary.rows.length > 0 && (
          <div className="adm-tablewrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Referral source</th><th>Code</th><th>Leads</th>
                  <th>Workshops</th><th>Audits</th><th>Pilots</th><th>Integrations</th>
                  <th>Won</th><th>Lost</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((r) => (
                  <tr key={r.referral_code + r.referral_source}>
                    <td>{r.referral_source}</td>
                    <td className="adm-mono">{r.referral_code}</td>
                    <td className="adm-num adm-strong">{r.leads}</td>
                    <td className="adm-num">{r.workshops}</td>
                    <td className="adm-num">{r.audits}</td>
                    <td className="adm-num">{r.pilots}</td>
                    <td className="adm-num">{r.integrations}</td>
                    <td className="adm-num">{r.won}</td>
                    <td className="adm-num">{r.lost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="adm-foot">
        Statuses: New Lead · Workshop · Audit · Pilot · Integration · Won · Lost. Update status directly
        in Supabase for now (no edit UI yet). Read-only dashboard.
      </p>
    </main>
  );
}
