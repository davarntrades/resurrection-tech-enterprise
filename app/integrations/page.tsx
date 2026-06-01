import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "How It Integrates",
  description:
    "Where Morrison Runtime Governance sits, how it plugs into the platforms you already run (governance dashboards, CRMs, Copilot, internal tools), and what it prevents — before execution.",
  alternates: { canonical: "/integrations" },
};

/* ── Small presentational helpers (static, no client JS) ── */

type Node = { label: string; sub?: string; tone?: "default" | "platform" | "agent" | "gov" | "system" };

function Flow({ nodes }: { nodes: Node[] }) {
  return (
    <div className="ig-flow reveal">
      {nodes.map((n, i) => (
        <div key={n.label} className="ig-flow-step">
          <div className={`ig-node ig-node--${n.tone ?? "default"}`}>
            <span className="ig-node-label">{n.label}</span>
            {n.sub && <span className="ig-node-sub">{n.sub}</span>}
          </div>
          {i < nodes.length - 1 && <div className="ig-arrow" aria-hidden="true">↓</div>}
        </div>
      ))}
    </div>
  );
}

function Verdicts() {
  return (
    <div className="ig-verdicts reveal" aria-label="Verdict outcomes">
      <span className="ig-vd allow">ALLOW</span>
      <span className="ig-vd block">BLOCK</span>
      <span className="ig-vd escalate">ESCALATE</span>
    </div>
  );
}

function BeforeAfter({
  before,
  after,
}: {
  before: string[];
  after: string[];
}) {
  return (
    <div className="ig-ba reveal">
      <div className="ig-ba-col is-before">
        <div className="ig-ba-h">Before</div>
        <ul>{before.map((b) => <li key={b}>{b}</li>)}</ul>
      </div>
      <div className="ig-ba-col is-after">
        <div className="ig-ba-h">After</div>
        <ul>{after.map((a) => <li key={a}>{a}</li>)}</ul>
      </div>
    </div>
  );
}

function Timeline({ steps }: { steps: string[] }) {
  return (
    <div className="ig-timeline reveal">
      {steps.map((s, i) => (
        <div key={s} className="ig-tl-step">
          <span className="ig-tl-dot" aria-hidden="true" />
          <span className="ig-tl-label">{s}</span>
          {i < steps.length - 1 && <span className="ig-tl-line" aria-hidden="true" />}
        </div>
      ))}
    </div>
  );
}

export default function Page() {
  return (
    <PageShell>
      {/* ── SECTION 1 — Hero / where it sits ── */}
      <section className="section section--tight ig" aria-label="Works inside your existing stack">
        <div className="wrap">
          <span className="eyebrow">How it integrates</span>
          <h1 className="ig-h1">Works Inside Your Existing Stack</h1>
          <p className="ig-lede">
            Morrison Runtime Governance™ is not a replacement for your platform. It sits between
            AI decision-making and execution, providing pre-execution governance before actions
            reach live systems.
          </p>
          <Flow
            nodes={[
              { label: "Existing Enterprise Platform", tone: "platform", sub: "Governance dashboard · CRM · internal tools" },
              { label: "AI Agent", tone: "agent", sub: "Proposes an action / trajectory" },
              { label: "Morrison Runtime Governance™", tone: "gov", sub: "Evaluates the trajectory before execution" },
            ]}
          />
          <div className="ig-arrow ig-arrow--center" aria-hidden="true">↓</div>
          <Verdicts />
          <div className="ig-arrow ig-arrow--center" aria-hidden="true">↓</div>
          <Flow nodes={[{ label: "Enterprise Systems", tone: "system", sub: "Only permitted actions execute" }]} />
          <p className="ig-fineprint">
            Product names below are used to illustrate common integration patterns and do not imply
            partnership or endorsement.
          </p>
        </div>
      </section>

      <hr className="divider" />

      {/* ── SECTION 2 — VerifyWise ── */}
      <section className="section section--tight ig" aria-label="VerifyWise integration example">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Governance dashboard</span>
            <h2>VerifyWise Integration Example</h2>
            <p>Governance verdicts surface inside the dashboard your risk team already uses.</p>
          </div>
          <Flow
            nodes={[
              { label: "VerifyWise Dashboard", tone: "platform" },
              { label: "AI Agent", tone: "agent" },
              { label: "Morrison Runtime Governance™", tone: "gov" },
              { label: "Risk Evaluation", tone: "default", sub: "ALLOW / BLOCK / ESCALATE" },
              { label: "VerifyWise Displays Result", tone: "system" },
            ]}
          />
          <BeforeAfter
            before={["Agent creates action.", "No runtime governance.", "Unsafe action reaches production."]}
            after={["Agent creates action.", "Runtime Governance evaluates the trajectory.", "Unsafe trajectory blocked.", "Risk surfaced inside VerifyWise."]}
          />
          <div className="ig-result reveal">
            <span className="ig-result-k">Result</span>
            <p>No production incident. No regulatory exposure. No rollback required.</p>
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ── SECTION 3 — CRM ── */}
      <section className="section section--tight ig" aria-label="CRM integration example">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">CRM (Salesforce-style)</span>
            <h2>CRM Integration Example</h2>
            <p>A customer requests a refund. The agent proposes a plan; governance evaluates it before anything executes.</p>
          </div>
          <div className="ig-plan reveal">
            <span className="ig-plan-k">Agent proposes</span>
            <ol>
              <li>Read account</li>
              <li>Issue refund</li>
              <li>Execute payment</li>
            </ol>
            <p className="ig-plan-note">Runtime Governance evaluates the trajectory → unauthorised refund trajectory detected.</p>
            <div className="ig-verdict-line"><span className="ig-vd block">BLOCK</span></div>
          </div>
          <Timeline steps={["Request", "Plan", "Governance", "Decision", "Outcome"]} />
        </div>
      </section>

      <hr className="divider" />

      {/* ── SECTION 4 — Customer support ── */}
      <section className="section section--tight ig" aria-label="Customer support agent example">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Customer support agent</span>
            <h2>Customer Support Agent Example</h2>
            <p>An agent accesses customer records, then attempts external transmission.</p>
          </div>
          <BeforeAfter
            before={["Agent reads customer records.", "Agent attempts external transmission.", "Customer data leaves the boundary."]}
            after={["Agent reads customer records.", "Agent attempts external transmission.", "Governance detects a data-exfiltration risk.", "Trajectory blocked before execution."]}
          />
          <div className="ig-result reveal is-block">
            <span className="ig-result-k">Outcome</span>
            <p><b>BLOCKED BEFORE EXECUTION</b> — customer data never leaves the approved boundary.</p>
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ── SECTION 5 — Copilot / internal agents ── */}
      <section className="section section--tight ig" aria-label="Microsoft Copilot and internal agent integration">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Copilot &amp; internal agents</span>
            <h2>Microsoft Copilot / Internal Agent Integration</h2>
            <p>Governance sits between any assistant and the enterprise tools it can act on — independent of the underlying model.</p>
          </div>
          <Flow
            nodes={[
              { label: "Copilot / Internal Agent", tone: "agent" },
              { label: "Morrison Runtime Governance™", tone: "gov" },
            ]}
          />
          <div className="ig-arrow ig-arrow--center" aria-hidden="true">↓</div>
          <div className="ig-tools reveal" aria-label="Connected enterprise tools">
            {["SharePoint", "Outlook", "CRM", "Internal databases"].map((t) => (
              <span key={t} className="ig-tool">{t}</span>
            ))}
          </div>
          <p className="ig-modelagnostic reveal">
            <span className="ig-ma-dot" aria-hidden="true" /> Model-agnostic — works across GPT, Claude, Gemini, Llama, and Mistral, because governance is enforced at the execution boundary, not inside the model.
          </p>
        </div>
      </section>

      <hr className="divider" />

      {/* ── SECTION 6 — How integration works ── */}
      <section className="section section--tight ig" aria-label="How integration works">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Integration workflow</span>
            <h2>How Integration Works</h2>
          </div>
          <div className="ig-steps reveal">
            {[
              ["01", "Deploy Runtime Governance", "Into SaaS, your VPC, or on-prem."],
              ["02", "Connect agent outputs", "Route proposed actions through the governance layer."],
              ["03", "Define forbidden states (Ω)", "The outcomes the system must never reach."],
              ["04", "Monitor decisions", "Every governed decision is recorded and auditable."],
              ["05", "Receive verdicts", "ALLOW / BLOCK / ESCALATE — before execution."],
            ].map(([n, h, p]) => (
              <div key={n} className="ig-step">
                <span className="ig-step-n">{n}</span>
                <div><div className="ig-step-h">{h}</div><div className="ig-step-p">{p}</div></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ── SECTION 7 — Deployment options ── */}
      <section className="section section--tight ig" aria-label="Deployment options">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Deployment</span>
            <h2>Deployment Options</h2>
          </div>
          <div className="ig-cards reveal">
            {[
              ["SaaS", "Managed deployment. Fastest onboarding."],
              ["Private Cloud", "Customer-controlled environment."],
              ["VPC", "Runs inside customer infrastructure."],
              ["On-Prem", "For highly regulated environments."],
            ].map(([h, p]) => (
              <div key={h} className="ig-card">
                <h3>{h}</h3>
                <p>{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ── SECTION 8 — What CEOs care about ── */}
      <section className="section section--tight ig" aria-label="What CEOs care about">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Business outcomes</span>
            <h2>What CEOs Actually Care About</h2>
          </div>
          <div className="ig-cards ig-cards--3 reveal">
            <div className="ig-card ig-card--accent">
              <h3>Reduce Regulatory Risk</h3>
              <p>Prevent unsafe actions before execution.</p>
            </div>
            <div className="ig-card ig-card--accent">
              <h3>Reduce Operational Risk</h3>
              <p>Stop costly incidents before they happen.</p>
            </div>
            <div className="ig-card ig-card--accent">
              <h3>Accelerate AI Adoption</h3>
              <p>Deploy AI with governance built in.</p>
            </div>
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ── SECTION 9 — During an assessment ── */}
      <section className="section section--tight ig" aria-label="What happens during a Runtime Governance Assessment">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Engagement</span>
            <h2>What Happens During a Runtime Governance Assessment</h2>
          </div>
          <div className="ig-days reveal">
            {[
              ["Day 1", "Architecture Review"],
              ["Day 2", "Trajectory Analysis"],
              ["Day 3", "Risk Mapping"],
              ["Day 4", "Governance Design"],
            ].map(([d, h]) => (
              <div key={d} className="ig-day">
                <span className="ig-day-n">{d}</span>
                <span className="ig-day-h">{h}</span>
              </div>
            ))}
          </div>
          <div className="ig-deliverables reveal">
            <span className="ig-deliverables-k">Final deliverables</span>
            <ul>
              <li>Executive Summary</li>
              <li>Risk Findings</li>
              <li>Forbidden-State Map</li>
              <li>Recommended Controls</li>
              <li>Integration Plan</li>
            </ul>
          </div>
          <div className="ig-cta reveal">
            <Link href="/book#assessment" className="btn btn--primary">Book a Runtime Safety Assessment <span className="arr">→</span></Link>
            <Link href="/sample-audit" className="btn btn--ghost">See a sample report</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
