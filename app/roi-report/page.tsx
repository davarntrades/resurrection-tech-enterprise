import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Executive ROI Report",
  robots: { index: false, follow: false },
};

const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Math.round(n));

function num(v: string | string[] | undefined, fallback: number): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function str(v: string | string[] | undefined, fallback: string): string {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length <= 80 ? s : fallback;
}

function recommend(inv: number): { name: string; band: string; href: string } {
  if (inv < 80_000) return { name: "48-Hour Runtime Governance Audit", band: "£40K–£75K", href: "/request-audit" };
  if (inv < 250_000) return { name: "Annual Runtime Governance Licence™", band: "£75K–£500K+ / yr", href: "/enterprise-pathways" };
  if (inv <= 750_000) return { name: "Limited Pilot™", band: "£250K–£750K+", href: "/pilot" };
  return { name: "Enterprise Integration", band: "By commercial review", href: "/contact" };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const type = str(sp.type, "Operational / infrastructure");
  const cost = num(sp.cost, 1_000_000);
  const per = num(sp.per, 2);
  const inv = num(sp.inv, 250_000);

  const avoided = cost * per;
  const net = avoided - inv;
  const roi = inv > 0 ? avoided / inv : 0;
  const payback = avoided > 0 ? Math.max(1, Math.round(inv / (avoided / 12))) : null;
  const roiLabel = roi >= 100 ? "100×+" : `${roi.toFixed(1)}×`;
  const rec = recommend(inv);

  let dateStr = "";
  try { dateStr = new Date().toLocaleDateString("en-GB", { dateStyle: "long" }); } catch { /* ignore */ }

  return (
    <main className="mgp-page rep roi-report">
      <div className="wrap">
        <div className="roi-toolbar">
          <Link href="/partner-portal#roi" className="btn btn--ghost btn--sm">← Back to calculator</Link>
          <PrintButton className="btn btn--primary btn--sm" />
        </div>

        <div className="rep-doc">
          <div className="rep-band">
            <span className="rep-band-k">Executive ROI Report</span>
            <h1 className="rep-band-title">The case for Runtime Governance</h1>
            <p className="rep-band-sub">Prepared with Resurrection Tech™ Runtime Governance — illustrative, for internal evaluation.</p>
            <div className="rep-meta">
              <div><span className="rep-meta-k">Incident type</span><span className="rep-meta-v">{type}</span></div>
              <div><span className="rep-meta-k">Prepared</span><span className="rep-meta-v">{dateStr || "—"}</span></div>
              <div><span className="rep-meta-k">Basis</span><span className="rep-meta-v">Customer assumptions</span></div>
              <div><span className="rep-meta-k">Classification</span><span className="rep-meta-v">Internal · Budget review</span></div>
            </div>
          </div>

          {/* Assumptions */}
          <section className="rep-sec">
            <span className="rep-eyebrow">1 · Customer assumptions</span>
            <h2 className="rep-h2">The inputs behind this case.</h2>
            <div className="rep-ev">
              <div className="rep-ev-row"><span className="rep-ev-k">Incident type</span><span className="rep-ev-v">{type}</span></div>
              <div className="rep-ev-row"><span className="rep-ev-k">Cost of a single catastrophic incident</span><span className="rep-ev-v">{gbp(cost)}</span></div>
              <div className="rep-ev-row"><span className="rep-ev-k">Catastrophic incidents prevented / year</span><span className="rep-ev-v">{per}</span></div>
              <div className="rep-ev-row"><span className="rep-ev-k">Annual governance investment</span><span className="rep-ev-v">{gbp(inv)}</span></div>
            </div>
          </section>

          {/* Results */}
          <section className="rep-sec">
            <span className="rep-eyebrow">2 · Results</span>
            <h2 className="rep-h2">What the investment returns.</h2>
            <div className="rep-kpis">
              <div className="rep-kpi"><span className="rep-kpi-v">{gbp(avoided)}</span><span className="rep-kpi-k">Annual exposure avoided</span></div>
              <div className="rep-kpi"><span className="rep-kpi-v">{gbp(inv)}</span><span className="rep-kpi-k">Governance investment</span></div>
              <div className="rep-kpi"><span className="rep-kpi-v">{gbp(net)}</span><span className="rep-kpi-k">Net annual value</span></div>
              <div className="rep-kpi"><span className="rep-kpi-v">{roiLabel}</span><span className="rep-kpi-k">Return multiple{payback ? ` · payback ~${payback} mo` : ""}</span></div>
            </div>
            <p className="rep-p" style={{ marginTop: 14 }}>
              On these assumptions, preventing <b>{per}</b> catastrophic incident{per === 1 ? "" : "s"} a year worth{" "}
              <b>{gbp(cost)}</b> each against a <b>{gbp(inv)}</b> investment returns <b>{gbp(net)}</b> in net annual value
              {roi > 0 ? <> — a <b>{roiLabel}</b> return.</> : "."}
            </p>
          </section>

          {/* Recommended engagement */}
          <section className="rep-sec">
            <span className="rep-eyebrow">3 · Recommended engagement</span>
            <h2 className="rep-h2">{rec.name}</h2>
            <p className="rep-p">
              At this investment level, the recommended starting engagement is the <b>{rec.name}</b>{" "}
              ({rec.band}). Final commercial terms are confirmed after assessment and deployment review.
            </p>
            <div className="rep-ev">
              <div className="rep-ev-row"><span className="rep-ev-k">Recommended engagement</span><span className="rep-ev-v">{rec.name}</span></div>
              <div className="rep-ev-row"><span className="rep-ev-k">Indicative band</span><span className="rep-ev-v">{rec.band}</span></div>
              <div className="rep-ev-row"><span className="rep-ev-k">Next step</span><span className="rep-ev-v">Assessment &amp; deployment review</span></div>
            </div>
          </section>

          <p className="rep-disc">
            Illustrative model, not a guarantee of savings. Incident costs reference documented industry
            precedents; actual exposure and prevention depend on the environment, agents, and governance
            configuration. Pricing is indicative and non-binding; final commercial terms are determined
            following assessment and deployment review. Prepared with Resurrection Tech™ — Patent GB2600765.8.
          </p>
        </div>

        <div className="roi-toolbar roi-toolbar--foot">
          <PrintButton className="btn btn--primary" />
          <Link href="/contact" className="btn btn--ghost">Discuss the engagement <span className="arr">→</span></Link>
        </div>
      </div>
    </main>
  );
}
