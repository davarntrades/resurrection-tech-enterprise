import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Design Partner Program — 3 Founding Enterprise Partners",
  description:
    "Resurrection Tech is selecting three founding design partners to deploy Morrison Runtime Governance in production — preferential pricing in exchange for a reference and attested results. Pre-execution governance for autonomous AI agents.",
  alternates: { canonical: "/design-partners" },
  openGraph: {
    title: "Design Partner Program — 3 Founding Enterprise Partners",
    description:
      "Three founding slots: deploy pre-execution Runtime Governance for your AI agents at preferential terms, in exchange for a reference and attested results.",
    url: "/design-partners",
  },
};

const GET = [
  ["Preferential pilot pricing", "A Structural Safety Pilot at founding-partner terms — materially below the standard £250K+ band — locked for the engagement."],
  ["Direct access to the engine team", "A shared Slack/Teams channel and weekly working sessions with the people who build Morrison Runtime Governance — not a support queue."],
  ["A bespoke Ω registry for your domain", "We onboard your sector's forbidden states (Ω) to your threat model — geometry unchanged, Ω expands — so coverage maps to your real risk."],
  ["Attested, audit-ready evidence", "Every verdict is replayable with an engine-commit + ruleset-hash attestation. You leave with a board- and auditor-ready evidence pack."],
  ["Influence the roadmap", "Founding partners shape integrations, reporting, and sector coverage before anyone else."],
];

const EXPECT = [
  ["A real agent in (or near) production", "An autonomous/agentic system with access to money, customer data, infrastructure, or regulated workflows."],
  ["An executive sponsor", "A CTO, CISO, VP Eng, or Head of AI who owns the risk and can clear a 4–8 week pilot."],
  ["A reference + attested result", "On success, a logo, a quote, and a metric we can publish (e.g. “X unsafe trajectories blocked before execution”). Anonymised options available under NDA."],
  ["Working sessions", "A few hours a week from an engineer who knows your tool surface, for the pilot duration."],
];

const STEPS = [
  ["1 · Assess", "Run the free Day-1 assessment on your agent's tool manifest — Ω exposure map + coverage in minutes."],
  ["2 · Exposure review", "A 30-minute call where we read your result, quantify the risk, and confirm fit."],
  ["3 · Scope", "We agree a fixed pilot SOW: deliverables, success criteria (0 FP / 0 FN on your corpus), and an exit gate."],
  ["4 · Pilot", "Staging deployment + governance integration, your Ω registry, replayable attestation — 4–8 weeks."],
  ["5 · Decide", "A clear go/no-go at the gate. Partners that proceed move to production + an advisory retainer."],
];

export default function Page() {
  return (
    <PageShell>
      <section className="section section--tight" aria-label="Design Partner Program">
        <div className="wrap prog">
          <header className="prog-hero">
            <p className="prog-eyebrow">Founding cohort · 3 slots</p>
            <h1 className="prog-title">Design Partner Program</h1>
            <p className="prog-lede">
              We&apos;re selecting <strong>three founding enterprise partners</strong> to deploy
              Morrison Runtime Governance in production — pre-execution governance that blocks an
              AI agent&apos;s unsafe actions <em>before</em> they run. Preferential terms, direct
              access to the engine team, and a bespoke Ω registry for your domain — in exchange for
              a reference and an attested result.
            </p>
            <div className="prog-cta">
              <Link href="/assess" className="btn btn--primary btn--live">
                <span className="live-pip" aria-hidden="true" />
                Assess your agent — free <span className="arr">→</span>
              </Link>
              <Link href="/book#assessment" className="btn btn--ghost">Apply for a founding slot →</Link>
            </div>
            <p className="prog-scarcity">Three slots. First-come, by fit. Each founding engagement is bespoke.</p>
          </header>

          <div className="prog-cols">
            <div className="prog-col">
              <h2 className="prog-h2">What you get</h2>
              <ul className="prog-list">
                {GET.map(([k, v]) => (
                  <li key={k}><strong>{k}.</strong> {v}</li>
                ))}
              </ul>
            </div>
            <div className="prog-col">
              <h2 className="prog-h2">What we ask</h2>
              <ul className="prog-list">
                {EXPECT.map(([k, v]) => (
                  <li key={k}><strong>{k}.</strong> {v}</li>
                ))}
              </ul>
            </div>
          </div>

          <h2 className="prog-h2 prog-h2--center">How a founding engagement runs</h2>
          <ol className="prog-steps">
            {STEPS.map(([k, v]) => (
              <li key={k}><span className="prog-step-k">{k}</span><span className="prog-step-v">{v}</span></li>
            ))}
          </ol>

          <div className="prog-foot">
            <h2 className="prog-h2">Ready to be a founding partner?</h2>
            <p>
              Start with the free assessment so the first call is about <em>your</em> exposure, not a
              generic pitch. We&apos;ll confirm fit and scope a fixed pilot.
            </p>
            <div className="prog-cta">
              <Link href="/assess" className="btn btn--primary">Assess your agent — free <span className="arr">→</span></Link>
              <Link href="/pilot" className="btn btn--ghost">See the pilot scope →</Link>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
