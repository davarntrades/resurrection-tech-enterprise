import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "How It Integrates",
  description:
    "Where Morrison Runtime Governance sits, how it plugs into the platforms you already run (governance dashboards, CRMs, internal assistants, internal tools), and the business risk it prevents — before execution.",
  alternates: { canonical: "/integrations" },
};

/* ── SVG workflow diagram (responsive, scrolls on small screens) ── */

type Tone = "platform" | "agent" | "gov" | "system" | "allow" | "block" | "escalate" | "step";
type FlowNode = { label: string; sub?: string; tone: Tone };

const NODE_W = 158;
const NODE_H = 64;
const GAP = 50;
const PAD = 16;

// The governance checkpoint, branded consistently across every flow.
const GOV: FlowNode = { label: "ℛ(t)", sub: "Morrison RG™", tone: "gov" };

function SvgFlow({ nodes, label }: { nodes: FlowNode[]; label: string }) {
  const n = nodes.length;
  const width = PAD * 2 + n * NODE_W + (n - 1) * GAP;
  const height = 118;
  const cy = 44;
  return (
    <div className="ig-svg-wrap reveal">
      <svg className="ig-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <defs>
          <marker id="igArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="ig-svg-arrowhead" />
          </marker>
        </defs>
        {nodes.map((node, i) => {
          const x = PAD + i * (NODE_W + GAP);
          const next = i < n - 1;
          return (
            <g key={node.label + i}>
              {next && (
                <line className="ig-svg-conn" x1={x + NODE_W} y1={cy + NODE_H / 2} x2={x + NODE_W + GAP} y2={cy + NODE_H / 2} markerEnd="url(#igArrow)" />
              )}
              <rect className={`ig-svg-node tone-${node.tone}`} x={x} y={cy} width={NODE_W} height={NODE_H} rx="11" />
              <text className={`ig-svg-label tone-${node.tone}`} x={x + NODE_W / 2} y={node.sub ? cy + NODE_H / 2 - 4 : cy + NODE_H / 2 + 4} textAnchor="middle">
                {node.label}
              </text>
              {node.sub && (
                <text className="ig-svg-sub" x={x + NODE_W / 2} y={cy + NODE_H / 2 + 15} textAnchor="middle">
                  {node.sub}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function BeforeAfter({ before, after }: { before: string[]; after: string[] }) {
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

/* Business-impact card — what the reader (CEO/CRO/COO/CISO) takes away. */
function ImpactCard({ items }: { items: [string, string][] }) {
  return (
    <div className="ig-impact reveal">
      <div className="ig-impact-h">
        <span>Business Impact</span>
        <span className="ig-impact-tag">illustrative</span>
      </div>
      <div className="ig-impact-grid">
        {items.map(([k, v]) => (
          <div className="ig-impact-cell" key={k}>
            <span className="ig-impact-k">{k}</span>
            <span className="ig-impact-v">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Generic enterprise governance dashboard — neutral, no vendor branding. */
function DashboardMock() {
  return (
    <div className="ig-dash reveal" role="img" aria-label="Illustrative governance dashboard with verdicts surfaced">
      <div className="ig-dash-bar">
        <span className="ig-dash-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="ig-dash-title">Governance Dashboard</span>
        <span className="ig-dash-rt" aria-hidden="true"><Logo height={13} /></span>
      </div>
      <div className="ig-dash-body">
        <div className="ig-dash-tiles">
          <div className="ig-dash-tile"><span className="v">142</span><span className="l">Agents monitored</span></div>
          <div className="ig-dash-tile"><span className="v">3,418</span><span className="l">Actions today</span></div>
          <div className="ig-dash-tile danger"><span className="v">7</span><span className="l">Blocked pre-execution</span></div>
        </div>
        <div className="ig-dash-feed">
          <div className="ig-dash-feed-h">Recent verdicts · ℛ(t)</div>
          <div className="ig-dash-row block"><span className="d" aria-hidden="true" />BLOCK<span className="m">data exfiltration · agent-7</span></div>
          <div className="ig-dash-row escalate"><span className="d" aria-hidden="true" />ESCALATE<span className="m">refund &gt; policy · agent-2</span></div>
          <div className="ig-dash-row allow"><span className="d" aria-hidden="true" />ALLOW<span className="m">internal report · agent-3</span></div>
        </div>
      </div>
      <div className="ig-dash-cap">Illustrative governance dashboard — generic enterprise category, not a specific product.</div>
    </div>
  );
}

export default function Page() {
  return (
    <PageShell>
      {/* ── SECTION 1 — Hero + banner + master flow ── */}
      <section className="section section--tight ig" aria-label="Works inside your existing stack">
        <div className="wrap">
          <span className="eyebrow">How it integrates</span>
          <h1 className="ig-h1">Works Inside Your Existing Stack</h1>
          <p className="ig-lede">
            Morrison Runtime Governance™ is not a replacement for your platform. It sits between
            AI decision-making and execution, providing pre-execution governance before actions
            reach live systems.
          </p>

          <div className="ig-banner reveal">
            <p className="ig-banner-strong">No dashboard replacement required.</p>
            <p className="ig-banner-sub">Morrison Runtime Governance sits between existing AI agents and enterprise systems.</p>
          </div>

          <div className="ig-brandlegend reveal">
            <span className="ig-bl-mark" aria-hidden="true"><Logo height={20} /></span>
            <span>
              <b>ℛ(t)</b> marks the <b>Morrison Runtime Governance™</b> checkpoint in every flow below —
              the active decision engine between AI agents and your systems.
            </span>
          </div>

          <SvgFlow
            label="Existing platform to AI agent to Morrison Runtime Governance checkpoint to verdict to enterprise systems"
            nodes={[
              { label: "Existing Platform", sub: "dashboard · CRM · tools", tone: "platform" },
              { label: "AI Agent", sub: "proposes action", tone: "agent" },
              GOV,
              { label: "Verdict", sub: "ALLOW · BLOCK · ESCALATE", tone: "step" },
              { label: "Enterprise Systems", sub: "permitted only", tone: "system" },
            ]}
          />

          <p className="ig-fineprint">
            Platform names are neutral category placeholders used to illustrate common integration
            patterns. They do not imply partnership, certification, endorsement, or any commercial
            relationship, and no third-party branding is reproduced.
          </p>
        </div>
      </section>

      <hr className="divider" />

      {/* ── SECTION 2 — Governance dashboard ── */}
      <section className="section section--tight ig" aria-label="Governance dashboard integration example">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Illustrative Integration Example</span>
            <h2>Governance Dashboard Integration</h2>
            <p>Verdicts surface inside the governance dashboard your risk team already uses — shown with a generic <b>Enterprise Risk Portal</b>.</p>
          </div>
          <DashboardMock />
          <SvgFlow
            label="Governance dashboard to agent to Morrison Runtime Governance to risk evaluation to dashboard result"
            nodes={[
              { label: "Governance Dashboard", tone: "platform" },
              { label: "AI Agent", tone: "agent" },
              GOV,
              { label: "Risk Evaluation", tone: "step" },
              { label: "Result In Dashboard", tone: "system" },
            ]}
          />
          <BeforeAfter
            before={["Agent creates action.", "No runtime governance.", "Unsafe action reaches production."]}
            after={["Agent creates action.", "ℛ(t) evaluates the trajectory.", "Unsafe trajectory blocked.", "Risk surfaced inside the dashboard."]}
          />
          <ImpactCard
            items={[
              ["Incident prevented", "Unsafe autonomous action reaching production."],
              ["Operational consequence avoided", "Emergency rollback and incident response."],
              ["Regulatory exposure avoided", "A reportable control failure."],
              ["Financial loss avoided", "Downtime and remediation costs."],
            ]}
          />
        </div>
      </section>

      <hr className="divider" />

      {/* ── SECTION 3 — CRM ── */}
      <section className="section section--tight ig" aria-label="CRM integration example">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Illustrative Integration Example</span>
            <h2>CRM Workflow Integration</h2>
            <p>A customer requests a refund. The agent proposes a plan; governance evaluates it before anything executes — shown with a generic <b>CRM Platform</b>.</p>
          </div>
          <SvgFlow
            label="CRM to agent to proposed plan to Morrison Runtime Governance to block"
            nodes={[
              { label: "CRM Platform", tone: "platform" },
              { label: "AI Agent", sub: "refund request", tone: "agent" },
              { label: "Proposed Plan", sub: "read · refund · pay", tone: "step" },
              GOV,
              { label: "BLOCK", sub: "unauthorised refund", tone: "block" },
            ]}
          />
          <div className="ig-result reveal is-block">
            <span className="ig-result-k">Outcome</span>
            <p>The unauthorised refund trajectory is denied before execution — the payment never runs.</p>
          </div>
          <ImpactCard
            items={[
              ["Incident prevented", "An unauthorised refund or payment."],
              ["Operational consequence avoided", "Manual clawback and reconciliation."],
              ["Regulatory exposure avoided", "Payment-controls / AML breach."],
              ["Financial loss avoided", "Direct funds loss (industry single-event precedent: £2B+)."],
            ]}
          />
        </div>
      </section>

      <hr className="divider" />

      {/* ── SECTION 4 — Customer support ── */}
      <section className="section section--tight ig" aria-label="Customer support agent example">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Illustrative Integration Example</span>
            <h2>Customer Support Agent Integration</h2>
            <p>A support agent accesses customer records, then attempts external transmission.</p>
          </div>
          <SvgFlow
            label="Support agent to read records to external send to Morrison Runtime Governance to block"
            nodes={[
              { label: "Support Agent", tone: "agent" },
              { label: "Read Records", sub: "customer data", tone: "step" },
              { label: "External Send", sub: "egress attempt", tone: "step" },
              GOV,
              { label: "BLOCK", sub: "data exfiltration", tone: "block" },
            ]}
          />
          <BeforeAfter
            before={["Agent reads customer records.", "Agent attempts external transmission.", "Customer data leaves the boundary."]}
            after={["Agent reads customer records.", "Agent attempts external transmission.", "ℛ(t) detects a data-exfiltration risk.", "Trajectory blocked before execution."]}
          />
          <ImpactCard
            items={[
              ["Incident prevented", "Customer-data exfiltration."],
              ["Operational consequence avoided", "Breach notification and customer remediation."],
              ["Regulatory exposure avoided", "GDPR / data-protection penalties."],
              ["Financial loss avoided", "Breach cost (industry average: £7.7M+)."],
            ]}
          />
        </div>
      </section>

      <hr className="divider" />

      {/* ── SECTION 5 — Internal Copilot ── */}
      <section className="section section--tight ig" aria-label="Internal assistant integration">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Illustrative Integration Example</span>
            <h2>Internal Copilot Integration</h2>
            <p>Governance sits between any internal assistant and the enterprise tools it can act on — independent of the underlying model.</p>
          </div>
          <SvgFlow
            label="Internal Copilot to Morrison Runtime Governance to enterprise tools"
            nodes={[
              { label: "Internal Copilot", sub: "internal assistant", tone: "agent" },
              GOV,
              { label: "Enterprise Tools", sub: "Docs · Email · CRM · Records", tone: "system" },
            ]}
          />
          <p className="ig-modelagnostic reveal">
            <span className="ig-ma-dot" aria-hidden="true" /> Model-agnostic — works across GPT, Claude, Gemini, Llama, and Mistral, because governance is enforced at the execution boundary, not inside the model.
          </p>
          <ImpactCard
            items={[
              ["Incident prevented", "An over-privileged action across internal tools."],
              ["Operational consequence avoided", "Unauthorised changes to documents, mail, and records."],
              ["Regulatory exposure avoided", "Access-control and privacy violations."],
              ["Financial loss avoided", "Insider-risk and cleanup costs."],
            ]}
          />
        </div>
      </section>

      <hr className="divider" />

      {/* ── SECTION 6 — Integration timeline ── */}
      <section className="section section--tight ig" aria-label="Integration timeline">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Integration timeline</span>
            <h2>From First Call To Production</h2>
            <p>A clear path into your environment — no equations, no theory.</p>
          </div>
          <div className="ig-pipeline reveal">
            {[
              ["Discovery", "Map where agents act and what could go wrong."],
              ["Ω Definition", "Define the forbidden states for your domain."],
              ["Integration", "Place ℛ(t) at the agent's execution boundary."],
              ["Validation", "Confirm interception on your own traffic."],
              ["Production", "Run with ALLOW / BLOCK / ESCALATE, fully audited."],
            ].map(([h, p], i) => (
              <div key={h} className="ig-pl-stage">
                <span className="ig-pl-n">{String(i + 1).padStart(2, "0")}</span>
                <div className="ig-pl-h">{h}</div>
                <div className="ig-pl-p">{p}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ── SECTION 7 — Deployment models ── */}
      <section className="section section--tight ig" aria-label="Deployment models">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Deployment</span>
            <h2>Deployment Models</h2>
          </div>
          <div className="ig-cards reveal">
            {[
              ["SaaS", "Managed deployment. Fastest onboarding."],
              ["Private Cloud", "Customer-controlled environment."],
              ["VPC", "Runs inside customer infrastructure."],
              ["On-Prem", "For highly regulated environments."],
            ].map(([h, p]) => (
              <div key={h} className="ig-card"><h3>{h}</h3><p>{p}</p></div>
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
            <div className="ig-card ig-card--accent"><h3>Reduce Regulatory Risk</h3><p>Prevent unsafe actions before execution.</p></div>
            <div className="ig-card ig-card--accent"><h3>Reduce Operational Risk</h3><p>Stop costly incidents before they happen.</p></div>
            <div className="ig-card ig-card--accent"><h3>Accelerate AI Adoption</h3><p>Deploy AI with governance built in.</p></div>
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
