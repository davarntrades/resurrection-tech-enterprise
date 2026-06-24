import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { PricingDisclaimer } from "@/components/PricingDisclaimer";

export const metadata: Metadata = {
  title: "Limited Pilot — Scope of Work",
  description:
    "The Morrison Runtime Governance pilot: a fixed-scope, 4–8 week engagement that puts pre-execution governance in front of your AI agent. Week-by-week deliverables, success criteria (0 FP / 0 FN), integrations, and a clear go/no-go exit gate.",
  alternates: { canonical: "/pilot" },
  openGraph: {
    title: "Limited Pilot — Scope of Work",
    description:
      "Fixed-scope, 4–8 week pilot: pre-execution governance in front of your agent, with week-by-week deliverables and a clear exit gate.",
    url: "/pilot",
  },
};

const WEEKS = [
  ["Week 0", "Kickoff & scope lock", [
    "Mutual action plan: dates, owners, success criteria, exit gate.",
    "Tool-manifest intake (or reuse your Day-1 assessment) → Ω exposure map.",
    "Security & data-handling review: deployment topology, metadata-only logging, no raw payloads stored.",
  ]],
  ["Weeks 1–2", "Ω registry & corpus", [
    "Build your sector Ω registry — forbidden states mapped to your threat model (geometry unchanged, Ω expands).",
    "Assemble a labelled evaluation corpus (adversarial + benign) from your real trajectories.",
    "Baseline: which catastrophic states are reachable today, and which tools reach them.",
  ]],
  ["Weeks 3–5", "Integration in staging", [
    "Governance middleware in front of the agent's tool calls (evaluate-plan / evaluate-step) in your staging environment.",
    "ALLOW / BLOCK / ESCALATE wired into the agent's execution path — nothing runs until a verdict is returned.",
    "Tune to 0 false-positives / 0 false-negatives on the corpus; human-escalation path for edge cases.",
  ]],
  ["Weeks 6–7", "Validation & evidence", [
    "Replay every verdict with an engine-commit + ruleset-hash attestation (reproducible, tamper-evident).",
    "Latency benchmark on your hardware (engine compute is sub-millisecond).",
    "Board- and auditor-ready evidence pack: coverage, corpus results, replay proof, audit trail.",
  ]],
  ["Week 8", "Go / no-go gate", [
    "Readout against the agreed success criteria.",
    "Clear decision: proceed to production + advisory retainer, or stop with a documented exposure report.",
    "Production rollout plan and ownership if proceeding.",
  ]],
];

const SUCCESS = [
  "0 false-positives / 0 false-negatives on the agreed evaluation corpus.",
  "Every blocked trajectory is replayable and attested (engine commit + ruleset hash).",
  "Sub-millisecond engine evaluation, measured on your hardware.",
  "A named owner and a documented path to production governance.",
];

const PROVIDE = [
  ["You provide", "Tool manifest + sample real trajectories · a staging environment · an executive sponsor · a few hours/week of an engineer who knows your tool surface."],
  ["We provide", "The engine + governance middleware · your bespoke Ω registry · corpus construction · integration support · the attested evidence pack."],
];

export default function Page() {
  return (
    <PageShell>
      <section className="section section--tight" aria-label="Limited Pilot — Scope of Work">
        <div className="wrap prog">
          <header className="prog-hero">
            <p className="prog-eyebrow">Limited Pilot · 4–8 weeks · fixed scope</p>
            <h1 className="prog-title">Pilot Scope of Work</h1>
            <p className="prog-lede">
              A fixed-scope engagement that puts <strong>pre-execution governance</strong> in front of
              your AI agent: it blocks reachable forbidden states <em>before</em> a tool runs. Clear
              deliverables each week, measurable success criteria, and a go/no-go gate — no open-ended
              consulting.
            </p>
            <div className="prog-cta">
              <Link href="/assess" className="btn btn--primary btn--live">
                <span className="live-pip" aria-hidden="true" />
                Start with a free assessment <span className="arr">→</span>
              </Link>
              <Link href="/book#assessment" className="btn btn--ghost">Scope a pilot →</Link>
            </div>
          </header>

          <ol className="prog-timeline">
            {WEEKS.map(([w, title, items]) => (
              <li key={w as string} className="prog-tl">
                <div className="prog-tl-when">{w}</div>
                <div className="prog-tl-body">
                  <h3 className="prog-tl-title">{title}</h3>
                  <ul>{(items as string[]).map((it) => <li key={it}>{it}</li>)}</ul>
                </div>
              </li>
            ))}
          </ol>

          <div className="prog-cols">
            <div className="prog-col">
              <h2 className="prog-h2">Success criteria</h2>
              <ul className="prog-list">{SUCCESS.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
            <div className="prog-col">
              <h2 className="prog-h2">Who does what</h2>
              <ul className="prog-list">
                {PROVIDE.map(([k, v]) => <li key={k}><strong>{k}.</strong> {v}</li>)}
              </ul>
            </div>
          </div>

          <div className="prog-foot">
            <p className="prog-pricedetail">
              Indicative investment: <strong>£250K–£750K+</strong> depending on agent complexity,
              integration surface, and sector. Founding <Link href="/design-partners">design partners</Link>{" "}
              receive preferential terms. The 48-Hour Runtime Governance Audit (£40K–£75K) is a faster,
              lower-commitment entry point that de-risks the pilot.
            </p>
            <PricingDisclaimer variant="short" />
            <div className="prog-cta">
              <Link href="/assess" className="btn btn--primary">Assess your agent — free <span className="arr">→</span></Link>
              <Link href="/enterprise-pathways" className="btn btn--ghost">All engagement options →</Link>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
