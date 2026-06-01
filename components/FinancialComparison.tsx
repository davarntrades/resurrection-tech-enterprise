"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Board-level financial exposure comparison. Horizontal bars on a logarithmic
 * scale so governance investment and catastrophic exposure are visible on one
 * axis. Governance items render in the brand accent; catastrophic exposures in
 * the Ω/omega tone. Bars animate from zero on scroll-in (reduced-motion safe).
 *
 * All figures are illustrative risk-comparison figures — not guaranteed savings.
 */

type Row = {
  label: string;
  display: string;
  value: number;
  kind: "gov" | "risk";
};

const ROWS: Row[] = [
  { label: "48-Hour Runtime Governance Audit", display: "£75K", value: 75_000, kind: "gov" },
  { label: "Annual Retainer", display: "£1.2M", value: 1_200_000, kind: "gov" },
  { label: "Healthcare / PHI breach", display: "£7.7M", value: 7_700_000, kind: "risk" },
  { label: "Credential exposure", display: "£10.22M", value: 10_220_000, kind: "risk" },
  { label: "GDPR regulatory fine", display: "£530M", value: 530_000_000, kind: "risk" },
  { label: "Major unauthorised funds transfer", display: "£2B+", value: 2_000_000_000, kind: "risk" },
];

// Log scale so a 26,000× range stays legible on a single axis.
const EXPS = ROWS.map((r) => Math.log10(r.value));
const MIN_E = Math.min(...EXPS) - 0.5;
const MAX_E = Math.max(...EXPS);
function widthPct(value: number) {
  const w = ((Math.log10(value) - MIN_E) / (MAX_E - MIN_E)) * 100;
  return Math.max(6, Math.min(100, w));
}

const EXPOSURE_TABLE: [string, string, string, "gov" | "risk"][] = [
  ["48-Hour Audit", "£40K–£75K", "Entry assessment", "gov"],
  ["Annual Retainer", "£420K–£1.2M/yr", "Continuous assurance", "gov"],
  ["Healthcare breach", "£7.7M", "~100× audit cost", "risk"],
  ["Credential exposure", "£10.22M", "~136× audit cost", "risk"],
  ["GDPR fine", "£530M", "~7,000× audit cost", "risk"],
  ["Major funds transfer", "£2B+", "~26,000× audit cost", "risk"],
];

export function FinancialComparison() {
  const reduce = useReducedMotion();

  return (
    <section className="section section--tight" id="cost-of-failure" aria-label="Financial risk comparison">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">Risk comparison</span>
          <h2>One prevented event can pay for years of governance.</h2>
          <p>
            The question is not whether governance costs money. The question is whether
            catastrophic states remain reachable. Runtime Governance is priced against the
            cost of <span className="om">Ω</span> becoming reachable — not the complexity of
            the software.
          </p>
        </div>

        {/* Bar chart */}
        <div className="fc-chart reveal" role="img" aria-label="Logarithmic comparison of governance investment versus illustrative catastrophic exposure">
          <div className="fc-legend" aria-hidden="true">
            <span className="fc-leg"><span className="fc-swatch gov" /> Governance investment</span>
            <span className="fc-leg"><span className="fc-swatch risk" /> Illustrative exposure</span>
            <span className="fc-scale">Logarithmic scale</span>
          </div>
          <ul className="fc-bars">
            {ROWS.map((r) => (
              <li className="fc-bar-row" key={r.label}>
                <span className="fc-bar-label">{r.label}</span>
                <span className="fc-bar-track">
                  <motion.span
                    className={`fc-bar-fill ${r.kind}`}
                    initial={reduce ? false : { width: 0 }}
                    whileInView={{ width: `${widthPct(r.value)}%` }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                  />
                  <span className="fc-bar-val">{r.display}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Exposure table */}
        <div className="tbl-wrap reveal" data-rowreveal>
          <table className="tbl fc-table">
            <thead>
              <tr><th>Scenario</th><th>Potential exposure</th><th>Governance comparison</th></tr>
            </thead>
            <tbody>
              {EXPOSURE_TABLE.map(([scenario, exposure, compare, kind]) => (
                <tr key={scenario}>
                  <td data-l="Scenario" className="t-main">{scenario}</td>
                  <td data-l="Potential exposure" className={kind === "risk" ? "t-cost" : "t-price"}>{exposure}</td>
                  <td data-l="Governance comparison" className={kind === "risk" ? "fc-mult" : "fc-gov"}>{compare}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="fc-foot reveal">
          Illustrative risk-comparison figures — not guaranteed savings. Exposure values
          reference documented industry incidents and regulatory maxima; comparisons use a
          £75K audit baseline. One prevented event can justify years of governance.
        </p>
      </div>
    </section>
  );
}
