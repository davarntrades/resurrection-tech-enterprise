"use client";

import Link from "next/link";
import { animate, motion, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * Board-level financial exposure dashboard for the ROI argument.
 *
 * Reads top-to-bottom as an executive decision arc:
 *   1. Risk-multiplier chips — the financial asymmetry, as animated counters.
 *   2. Executive decision dashboard — Bloomberg/Palantir-style verdict card.
 *   3. Log-scale bar chart — governance investment vs catastrophic exposure.
 *   4. Exposure table — scenario / exposure / comparison.
 *   5. Conversion CTA — the natural conclusion of the argument.
 *
 * Governance items render in the brand accent; catastrophic exposure in the
 * Ω/omega tone. All figures are illustrative risk-comparison figures — not
 * guaranteed savings. Counters and bars animate from zero on scroll-in and
 * are disabled under prefers-reduced-motion.
 */

/* ---------- animated count-up ---------- */
function Counter({
  to,
  format,
  duration = 1.6,
}: {
  to: number;
  format: (n: number) => string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (reduce) {
      setVal(to);
      return;
    }
    if (!inView) return;
    const controls = animate(0, to, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setVal(v),
    });
    return () => controls.stop();
  }, [inView, reduce, to, duration]);

  return <span ref={ref}>{format(val)}</span>;
}

const mult = (n: number) => `${Math.round(n).toLocaleString("en-GB")}×`;

/* ---------- data ---------- */
type Mult = { event: string; eventValue: string; to: number; sector: string };
const MULTIPLIERS: Mult[] = [
  { sector: "Healthcare", event: "PHI breach", eventValue: "£7.7M", to: 103 },
  { sector: "Cybersecurity", event: "Credential breach", eventValue: "£10.22M", to: 136 },
  { sector: "Data privacy", event: "GDPR fine", eventValue: "£530M", to: 7067 },
  { sector: "Finance", event: "Funds transfer", eventValue: "£2B+", to: 26666 },
];

type Row = { label: string; display: string; value: number; kind: "gov" | "risk" };
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
  ["Healthcare breach", "£7.7M", "~103× audit cost", "risk"],
  ["Credential exposure", "£10.22M", "~136× audit cost", "risk"],
  ["GDPR fine", "£530M", "~7,067× audit cost", "risk"],
  ["Major funds transfer", "£2B+", "~26,666× audit cost", "risk"],
];

export function FinancialComparison() {
  const reduce = useReducedMotion();

  return (
    <section className="section section--tight" id="cost-of-failure" aria-label="Financial risk comparison">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">Risk comparison</span>
          <h2>The financial asymmetry of one unsafe execution.</h2>
          <p>
            Governance cost is bounded. Catastrophic exposure is not. The figures below weigh
            the cost of a Runtime Governance engagement against the documented cost of{" "}
            <span className="om">Ω</span> becoming reachable.
          </p>
        </div>

        {/* 1 — Risk-multiplier chips (multiplier leads the eye) */}
        <div className="fc-mults reveal" aria-label="Exposure multiples versus a £75K audit baseline">
          {MULTIPLIERS.map((m) => (
            <div className="fc-mult-card" key={m.event}>
              <div className="fc-mult-num">
                <Counter to={m.to} format={mult} />
              </div>
              <div className="fc-mult-cap">exposure multiple · {m.sector}</div>
              <div className="fc-mult-vs">
                <span className="gov">£75K audit</span>
                <span className="fc-mult-arrow" aria-hidden="true">vs</span>
                <span className="risk">{m.eventValue} {m.event}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 2 — Executive decision dashboard */}
        <div className="fc-exec reveal" role="group" aria-label="Risk exposure summary">
          <div className="fc-exec-head">
            <span className="fc-exec-title">Risk Exposure Summary</span>
            <span className="fc-exec-live"><span className="fc-exec-dot" aria-hidden="true" />Runtime governed</span>
          </div>
          <div className="fc-exec-rows">
            <div className="fc-exec-row">
              <span className="fc-exec-k">Audit Cost</span>
              <span className="fc-exec-v gov">£75,000</span>
            </div>
            <div className="fc-exec-row">
              <span className="fc-exec-k">Reachable Financial Exposure</span>
              <span className="fc-exec-v risk">£2,000,000,000+</span>
            </div>
            <div className="fc-exec-row">
              <span className="fc-exec-k">Risk Multiple</span>
              <span className="fc-exec-v risk fc-exec-ratio">
                <Counter to={26666} format={mult} />
              </span>
            </div>
            <div className="fc-exec-row">
              <span className="fc-exec-k">Potential Outcome</span>
              <span className="fc-exec-v">Prevented Before Execution</span>
            </div>
            <div className="fc-exec-row">
              <span className="fc-exec-k">Status</span>
              <span className="fc-exec-status">Structurally governed</span>
            </div>
          </div>
          <div className="fc-exec-roi">
            <span className="fc-exec-roi-k">ROI Framing</span>
            <p className="fc-exec-roi-v">
              If one catastrophic execution is prevented, governance pays for itself many
              times over — eliminating exposure thousands of times larger than deployment cost.
            </p>
          </div>
        </div>

        {/* 3 — Anchor pull-quote */}
        <blockquote className="fc-quote reveal">
          We do not price according to software complexity. We price according to the cost of{" "}
          <span className="om">Ω</span> becoming reachable.
        </blockquote>

        {/* 4 — Bar chart */}
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

        {/* 5 — Exposure table */}
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
                  <td data-l="Governance comparison" className={kind === "risk" ? "fc-mult-cell" : "fc-gov-cell"}>{compare}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="fc-foot reveal">
          Illustrative risk-comparison figures — not guaranteed savings. Exposure values
          reference documented industry incidents and regulatory maxima; comparisons use a
          £75K audit baseline.
        </p>

        {/* 6 — Conversion CTA */}
        <div className="fc-cta reveal">
          <div className="fc-cta-body">
            <h3 className="fc-cta-h">One prevented event can pay for years of governance.</h3>
            <p className="fc-cta-sub">
              The audit identifies which catastrophic states are reachable in your system today —
              and moves <span className="om">Ω</span> out of reach before it executes.
            </p>
          </div>
          <Link href="/book#assessment" className="btn btn--primary fc-cta-btn">
            Book Runtime Safety Assessment <span className="arr">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
