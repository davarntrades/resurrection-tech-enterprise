import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { PricingDisclaimer } from "@/components/PricingDisclaimer";

export const metadata: Metadata = {
  title: "Strategic Alliance Partner™",
  description:
    "A Strategic Alliance Partner™ opens enterprise doors — bringing qualified introductions and strategic market access to Resurrection Tech's Runtime Governance, and is compensated on realised revenue. For advisors, consultants, introducers, analysts, and investors. No fee to join.",
  alternates: { canonical: "/strategic-alliance-partner" },
};

const Check = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8.5 L6.5 12 L13 4" stroke="#e0a93f" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const WHO = [
  ["Advisors & consultants", "Trusted advisors who can introduce governance to the enterprises they serve."],
  ["Management consultancies", "Firms shaping AI strategy who want a category-defining capability to recommend."],
  ["Introducers & connectors", "Well-networked individuals who can open doors to qualified opportunities."],
  ["Industry analysts", "Voices that influence how enterprises evaluate AI governance."],
  ["Investors & VCs", "Funds making warm introductions across their portfolio and network."],
  ["Boutique advisory firms", "Specialist practices in risk, compliance, or AI with enterprise relationships."],
];

const JOURNEY = [
  ["Discovery call", "We confirm fit and the enterprise relationships you can open."],
  ["Alliance agreement", "Commercial terms are agreed — there is no fee to join."],
  ["Deal registration", "Register named accounts so attribution is clear and time-boxed."],
  ["Qualified introduction", "You introduce the opportunity to Resurrection Tech."],
  ["Resurrection Tech-led engagement", "We run the assessment through to deployment directly."],
  ["Commission on realised revenue", "You are compensated on closed, realised revenue."],
  ["Ongoing relationship", "Continued introductions and account growth over time."],
];

const RT_PROVIDES = [
  "Deal registration",
  "Named-account protection",
  "Sales materials & enablement",
  "Commercial terms",
  "Attribution tracking",
  "Partner support",
];

const PARTNER_PROVIDES = [
  "Qualified introductions",
  "Trusted relationships",
  "Market & sector context",
  "Strategic positioning",
];

const STORY: { t: string; k?: string; tone?: "key" | "gov" }[] = [
  { t: "Advisor / consultant", k: "Partner" },
  { t: "Knows an enterprise deploying autonomous agents." },
  { t: "Introduces them to Resurrection Tech.", tone: "key" },
  { t: "The introduction is registered to the partner." },
  { t: "Resurrection Tech runs the engagement directly." },
  { t: "The enterprise becomes a customer." },
  { t: "The partner earns commission on realised revenue.", tone: "key" },
  { t: "No delivery or support overhead for the partner." },
];

const COMMERCIAL = [
  ["Joining fee", "There is no fee to join the alliance.", "No charge"],
  ["Commission", "Paid on realised revenue from your introductions.", "Commission-based"],
  ["Deal registration", "Time-boxed attribution on registered, named accounts.", "Per agreement"],
  ["Existing pipeline", "No commission on already-active pipeline.", "Excluded"],
];

export default function Page() {
  return (
    <PageShell>
      <div className="mgp-page">
      {/* ===== HERO ===== */}
      <section className="section mgp" id="strategic-alliance-partner">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Partner programme</span>
            <h1>Strategic Alliance Partner™</h1>
            <p className="mgp-lede">
              Open enterprise doors. Strategic Alliance Partners bring qualified introductions and
              strategic market access to Runtime Governance — and are compensated on realised revenue,
              with no delivery overhead and no fee to join.
            </p>
          </div>
          <div className="hero-actions reveal" data-d="1" style={{ marginTop: 28 }}>
            <Link href="/contact" className="btn btn--primary">Discuss Partnership <span className="arr">→</span></Link>
            <Link href="/book#strategy" className="btn btn--ghost">Book a call <span className="arr">→</span></Link>
          </div>
        </div>
      </section>

      {/* ===== WHAT IS IT ===== */}
      <section className="section section--tight" id="what">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">What it is</span>
            <h2>What is a Strategic Alliance Partner™?</h2>
          </div>
          <div className="mgp-prose reveal">
            <p>
              A Strategic Alliance Partner™ is an advisor, consultant, introducer, or firm that brings
              qualified enterprise opportunities to Resurrection Tech. It is a market-access and
              introduction motion — not a delivery or support relationship.
            </p>
            <p>
              You make the introduction and register the account; Resurrection Tech runs the engagement
              directly, from assessment through deployment. You are compensated on realised revenue.
              There is no fee to join, and no commission is taken on pipeline that is already active.
            </p>
          </div>
        </div>
      </section>

      {/* ===== EXAMPLE JOURNEY ===== */}
      <section className="section section--tight" id="example">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Worked example</span>
            <h2>Example introduction journey</h2>
            <p>How the alliance works in practice — you open the door; Resurrection Tech delivers.</p>
          </div>
          <div className="mgp-story reveal" data-d="1" aria-label="Example introduction journey">
            {STORY.map((s, i) => (
              <Fragment key={s.t}>
                {i > 0 && <div className="mgp-flow-arrow" aria-hidden="true">↓</div>}
                <div className={`mgp-flow-node${s.tone === "key" ? " mgp-flow-node--key" : s.tone === "gov" ? " mgp-flow-node--gov" : ""}`}>
                  {s.k && <span className="mgp-story-k">{s.k}</span>}
                  {s.tone ? <b>{s.t}</b> : s.t}
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* ===== WHO IT'S FOR ===== */}
      <section className="section section--tight" id="who">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Who it&rsquo;s for</span>
            <h2>Who is this designed for?</h2>
            <p>Those whose relationships and credibility can open qualified enterprise opportunities.</p>
          </div>
          <div className="mgp-who reveal" data-d="1">
            {WHO.map(([h, p]) => (
              <div className="mgp-who-card" key={h}>
                <h3 className="mgp-who-h">{h}</h3>
                <p className="mgp-who-p">{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== ENGAGEMENT JOURNEY ===== */}
      <section className="section section--tight" id="journey">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">How it works</span>
            <h2>Typical engagement journey</h2>
            <p>From first contact through realised revenue.</p>
          </div>
          <ol className="mgp-journey reveal" data-d="1">
            {JOURNEY.map(([h, p]) => (
              <li key={h}>
                <div>
                  <span className="mgp-journey-h">{h}</span>
                  <span className="mgp-journey-p">{p}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ===== RESPONSIBILITIES ===== */}
      <section className="section section--tight" id="responsibilities">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Division of responsibility</span>
            <h2>Who provides what.</h2>
          </div>
          <div className="scale-grid">
            <div className="scale-col is reveal">
              <h3>Resurrection Tech provides</h3>
              {RT_PROVIDES.map((t) => (
                <div className="scale-li" key={t}><span className="ic"><Check /></span><span className="txt">{t}</span></div>
              ))}
            </div>
            <div className="scale-col is reveal" data-d="1">
              <h3>The partner provides</h3>
              {PARTNER_PROVIDES.map((t) => (
                <div className="scale-li" key={t}><span className="ic"><Check /></span><span className="txt">{t}</span></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== COMMERCIAL MODEL ===== */}
      <section className="section section--tight" id="commercial">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Commercial model</span>
            <h2>How the commercials work.</h2>
            <p>No fee to join. You are compensated on realised revenue from registered introductions.</p>
          </div>
          <div className="tbl-wrap reveal" data-rowreveal>
            <table className="tbl">
              <thead>
                <tr><th>Component</th><th>What it covers</th><th>Indicative basis</th></tr>
              </thead>
              <tbody>
                {COMMERCIAL.map(([c, d, v]) => (
                  <tr key={c}>
                    <td data-l="Component" className="t-main">{c}</td>
                    <td data-l="What it covers">{d}</td>
                    <td data-l="Indicative basis" className="t-price">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PricingDisclaimer variant="full" />
        </div>
      </section>

      {/* ===== WHY ===== */}
      <section className="section section--tight" id="why">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Why partner</span>
            <h2>Why become a Strategic Alliance Partner™?</h2>
          </div>
          <div className="mgp-prose reveal" data-d="1">
            <p>
              Your enterprise relationships are valuable, and your customers are now asking how
              autonomous AI gets governed. A Strategic Alliance lets you bring them a category-defining
              answer — without taking on delivery, support, or technical risk.
            </p>
            <p>
              You make the introduction; Resurrection Tech runs the engagement and maintains the
              technology. You are rewarded on realised revenue, with named-account protection and clear,
              time-boxed attribution.
            </p>
          </div>
          <div className="hero-actions reveal" data-d="1" style={{ marginTop: 36 }}>
            <Link href="/contact" className="btn btn--primary">Discuss Partnership <span className="arr">→</span></Link>
            <Link href="/enterprise-pathways#partner-licensing" className="btn btn--ghost">See all partner pathways <span className="arr">→</span></Link>
          </div>
        </div>
      </section>
      </div>
    </PageShell>
  );
}
