"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Interactive ROI calculator — models prevented-incident value against the
 * governance investment. Illustrative; all inputs are client-side. Gold
 * .mgp-page theme of its host page.
 */
const SECTORS: { k: string; v: number }[] = [
  { k: "Financial loss / funds transfer", v: 2_000_000 },
  { k: "Healthcare / PHI breach", v: 7_700_000 },
  { k: "Cybersecurity / credential breach", v: 10_220_000 },
  { k: "Data privacy / regulatory exposure", v: 5_000_000 },
  { k: "Operational / infrastructure", v: 1_000_000 },
];

const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Math.round(n));

export function RoiCalculator() {
  const [sector, setSector] = useState(0);
  const [incidentCost, setIncidentCost] = useState(SECTORS[0].v);
  const [perYear, setPerYear] = useState(2);
  const [investment, setInvestment] = useState(250_000);

  const avoided = incidentCost * perYear;
  const net = avoided - investment;
  const roi = investment > 0 ? avoided / investment : 0;
  const paybackMonths = avoided > 0 ? Math.max(1, Math.round(investment / (avoided / 12))) : null;

  function pickSector(i: number) {
    setSector(i);
    setIncidentCost(SECTORS[i].v);
  }

  return (
    <section className="section section--tight" id="roi">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">ROI</span>
          <h2>Model the value of prevention.</h2>
          <p>One prevented catastrophic action can outweigh a year of governance. Adjust the inputs to your customer&rsquo;s situation.</p>
        </div>

        <div className="roi reveal" data-d="1">
          <div className="roi-controls">
            <div className="roi-field">
              <label htmlFor="roi-sector">Incident type</label>
              <select id="roi-sector" className="rgq-input" value={sector} onChange={(e) => pickSector(Number(e.target.value))}>
                {SECTORS.map((s, i) => <option key={s.k} value={i}>{s.k}</option>)}
              </select>
            </div>
            <div className="roi-field">
              <label htmlFor="roi-cost">Cost of a single catastrophic incident <b>{gbp(incidentCost)}</b></label>
              <input id="roi-cost" className="roi-range" type="range" min={250_000} max={20_000_000} step={250_000}
                value={incidentCost} onChange={(e) => setIncidentCost(Number(e.target.value))} />
            </div>
            <div className="roi-field">
              <label htmlFor="roi-per">Catastrophic incidents prevented / year <b>{perYear}</b></label>
              <input id="roi-per" className="roi-range" type="range" min={0} max={10} step={1}
                value={perYear} onChange={(e) => setPerYear(Number(e.target.value))} />
            </div>
            <div className="roi-field">
              <label htmlFor="roi-inv">Annual governance investment <b>{gbp(investment)}</b></label>
              <input id="roi-inv" className="roi-range" type="range" min={50_000} max={1_000_000} step={25_000}
                value={investment} onChange={(e) => setInvestment(Number(e.target.value))} />
            </div>
          </div>

          <div className="roi-out">
            <div className="roi-kpis">
              <div className="roi-kpi"><span className="roi-kpi-v gold">{gbp(avoided)}</span><span className="roi-kpi-k">Annual exposure avoided</span></div>
              <div className="roi-kpi"><span className="roi-kpi-v">{gbp(investment)}</span><span className="roi-kpi-k">Governance investment</span></div>
              <div className="roi-kpi"><span className={`roi-kpi-v ${net >= 0 ? "pos" : ""}`}>{gbp(net)}</span><span className="roi-kpi-k">Net annual value</span></div>
              <div className="roi-kpi"><span className="roi-kpi-v gold">{roi >= 100 ? "100×+" : `${roi.toFixed(1)}×`}</span><span className="roi-kpi-k">Return multiple{paybackMonths ? ` · payback ~${paybackMonths} mo` : ""}</span></div>
            </div>
            <p className="roi-summary">
              On these assumptions, preventing <b>{perYear}</b> catastrophic incident{perYear === 1 ? "" : "s"} a year worth{" "}
              <b>{gbp(incidentCost)}</b> each against a <b>{gbp(investment)}</b> investment returns <b>{gbp(net)}</b> in net
              annual value{roi > 0 ? <> — a <b>{roi >= 100 ? "100×+" : `${roi.toFixed(1)}×`}</b> return.</> : "."}
            </p>
            <Link
              className="btn btn--primary roi-export"
              href={`/roi-report?type=${encodeURIComponent(SECTORS[sector].k)}&cost=${incidentCost}&per=${perYear}&inv=${investment}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Generate Executive ROI Report <span className="arr" aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>

        <p className="pricing-disc" role="note" style={{ marginTop: 18 }}>
          Illustrative model, not a guarantee of savings. Incident costs reference documented industry
          precedents; actual exposure and prevention depend on your environment, agents, and governance
          configuration. Investment bands map to Resurrection Tech engagements (audit, pilot, annual
          licence, managed platform).
        </p>
      </div>
    </section>
  );
}
