import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "EU AI Act & Compliance Positioning — Runtime Governance",
  description:
    "Does Runtime Governance make you EU AI Act compliant? No — compliance is a legal determination. But Runtime Governance provides the technical controls and audit evidence that help organisations meet EU AI Act Articles 9, 12, 14 and 15 for agentic AI systems, with replayable evidence for every governed decision.",
  alternates: { canonical: "/compliance" },
  openGraph: {
    title: "Does Runtime Governance make me EU AI Act compliant?",
    description:
      "The honest answer, mapped to EU AI Act Articles 9, 12, 14 and 15 — with what Runtime Governance does and does not provide.",
    url: "/compliance",
  },
};

const PRIMARY = [
  ["Article 9", "Risk Management"],
  ["Article 12", "Record-Keeping, Logging & Traceability"],
  ["Article 14", "Human Oversight"],
  ["Article 15", "Accuracy, Robustness & Cybersecurity"],
];
const STRONG = [
  ["Article 26", "Deployer Obligations"],
  ["Article 19", "Automatically Generated Logs"],
];
const SUPPORTING = [
  ["Article 72", "Post-Market Monitoring"],
  ["Article 13", "Transparency"],
  ["Article 21", "Cooperation with Authorities"],
  ["Article 17", "Quality Management (support)"],
];

// How Runtime Governance supports the specific Article 26 deployer duties.
const ART26 = [
  ["Pre-execution controls", "Unsafe agent actions are blocked before they run — operationalising the duty to operate the system safely and under oversight (Art 26(1)–(2))."],
  ["Human review visibility", "Borderline trajectories are surfaced and escalated for human review, supporting oversight by assigned, competent persons (Art 26(2))."],
  ["Replayable audit evidence", "Every decision is reproducible with an attestation, supporting the duty to keep the system's automatically generated logs (Art 26(6))."],
  ["Deterministic decision records", "Each ALLOW / BLOCK is a deterministic, attributable record — traceable evidence of how the system was operated."],
  ["Risk exposure mapping", "Continuous mapping of which trajectories can reach forbidden states, supporting the duty to monitor operation and act on risk (Art 26(5))."],
  ["Runtime monitoring evidence", "Ongoing runtime logs and metrics, supporting the duty to monitor operation and inform the provider of any risk (Art 26(5))."],
];

const PROVIDES = [
  "Pre-execution risk controls",
  "Deterministic ALLOW / BLOCK enforcement",
  "Replayable audit trails",
  "Trajectory-level traceability",
  "Human-review visibility",
  "Verifiable governance evidence",
];

const NOT = [
  "Legal classification of your AI system",
  "Conformity assessments",
  "Quality management systems (QMS)",
  "Regulatory registration",
  "Legal advice",
];

const TABLE: [string, boolean][] = [
  ["Pre-execution controls", true],
  ["Audit evidence", true],
  ["Traceability", true],
  ["Human oversight support", true],
  ["Risk management support", true],
  ["Legal certification", false],
  ["Conformity assessment", false],
  ["Legal advice", false],
];

export default function Page() {
  return (
    <PageShell>
      <section className="section section--tight" aria-label="EU AI Act compliance positioning">
        <div className="wrap prog cmpl">
          <header className="prog-hero">
            <p className="prog-eyebrow">Compliance positioning · EU AI Act</p>
            <h1 className="prog-title">Does Runtime Governance make me EU AI Act compliant?</h1>
            <p className="prog-lede">
              <strong>No.</strong> Runtime Governance is not a legal certification, and the EU AI Act
              does not certify a company, website, or tool as &ldquo;compliant.&rdquo; What Runtime
              Governance does provide is a set of <strong>technical controls, enforcement mechanisms,
              and audit evidence</strong> that help organisations meet key obligations for agentic AI
              systems.
            </p>
          </header>

          <p className="cmpl-deployer">
            <strong>Built for AI deployers, not just AI providers.</strong> Most AI-Act tooling
            targets provider obligations; Runtime Governance also provides the enforcement and
            evidence controls that support <em>deployer</em> obligations (Article 26) — where most
            enterprises actually sit.
          </p>

          <h2 className="prog-h2">Primary alignment</h2>
          <ul className="cmpl-articles">
            {PRIMARY.map(([a, t]) => (
              <li key={a}><span className="cmpl-art">{a}</span><span className="cmpl-art-t">{t}</span></li>
            ))}
          </ul>

          <h2 className="prog-h2">Strong additional alignment</h2>
          <ul className="cmpl-articles">
            {STRONG.map(([a, t]) => (
              <li key={a} className="cmpl-articles--strong"><span className="cmpl-art">{a}</span><span className="cmpl-art-t">{t}</span></li>
            ))}
          </ul>

          <div className="cmpl-how">
            <h3 className="cmpl-how-title">How Runtime Governance supports Article 26 (Deployer Obligations)</h3>
            <p className="cmpl-how-lede">
              Article 26 places operational duties on the organisations that <em>deploy</em> high-risk
              AI systems — human oversight, monitoring, acting on risk, and keeping logs. Runtime
              Governance provides enforcement and evidence controls that support those duties:
            </p>
            <div className="cmpl-how-grid">
              {ART26.map(([k, v]) => (
                <div key={k} className="cmpl-how-item">
                  <span className="cmpl-how-k">{k}</span>
                  <span className="cmpl-how-v">{v}</span>
                </div>
              ))}
            </div>
          </div>

          <h2 className="prog-h2">Supporting alignment</h2>
          <ul className="cmpl-articles cmpl-articles--muted">
            {SUPPORTING.map(([a, t]) => (
              <li key={a}><span className="cmpl-art">{a}</span><span className="cmpl-art-t">{t}</span></li>
            ))}
          </ul>

          <div className="prog-cols">
            <div className="prog-col">
              <h2 className="prog-h2">Runtime Governance provides</h2>
              <ul className="cmpl-list cmpl-list--yes">
                {PROVIDES.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </div>
            <div className="prog-col">
              <h2 className="prog-h2">What it does not provide</h2>
              <ul className="cmpl-list cmpl-list--no">
                {NOT.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </div>
          </div>

          <blockquote className="cmpl-positioning">
            &ldquo;Runtime Governance provides the enforcement and audit-trail controls that help
            organisations demonstrate compliance with EU AI Act Articles 9, 12, 14 and 15 for agentic
            AI systems — with replayable evidence for every governed decision.&rdquo;
          </blockquote>

          <p className="cmpl-note">
            Compliance is ultimately a legal determination based on a specific AI system and deployment
            context. Runtime Governance acts as a technical control and evidence layer within a broader
            compliance programme.
          </p>

          <h2 className="prog-h2 prog-h2--center">At a glance</h2>
          <div className="cmpl-table-wrap">
            <table className="cmpl-table">
              <thead><tr><th>Capability</th><th>Runtime Governance</th></tr></thead>
              <tbody>
                {TABLE.map(([q, yes]) => (
                  <tr key={q}>
                    <td>{q}</td>
                    <td className={yes ? "cmpl-yes" : "cmpl-no"}>{yes ? "✓" : "✗"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="prog-foot">
            <p>
              Want to see which obligations apply to <em>your</em> agent? Run the free assessment — it
              maps your tools to the live Ω catalog and shows the trajectories Runtime Governance would
              block before execution, with replayable evidence.
            </p>
            <div className="prog-cta">
              <Link href="/assess" className="btn btn--primary">Assess your agent — free <span className="arr">→</span></Link>
              <Link href="/security" className="btn btn--ghost">Security &amp; trust →</Link>
              <Link href="/book#assessment" className="btn btn--ghost">Talk to us →</Link>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
