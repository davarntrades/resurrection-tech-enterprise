import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "How It Integrates",
  description:
    "Where Morrison Runtime Governance sits, how it plugs into the platforms you already run (governance dashboards, CRMs, Copilot, internal tools), and what it prevents — before execution.",
  alternates: { canonical: "/integrations" },
};

/* ── SVG workflow diagram (responsive, scrolls on small screens) ── */

type Tone = "platform" | "agent" | "gov" | "system" | "allow" | "block" | "escalate" | "step";
type FlowNode = { label: string; sub?: string; tone: Tone };

const NODE_W = 158;
const NODE_H = 64;
const GAP = 50;
const PAD = 16;

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
                <line
                  className="ig-svg-conn"
                  x1={x + NODE_W}
                  y1={cy + NODE_H / 2}
                  x2={x + NODE_W + GAP}
                  y2={cy + NODE_H / 2}
                  markerEnd="url(#igArrow)"
                />
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

          <SvgFlow
            label="Existing platform to AI agent to Runtime Governance to verdict to enterprise systems"
            nodes={[
              { label: "Existing Platform", sub: "dashboard · CRM · tools", tone: "platform" },
              { label: "AI Agent", sub: "proposes action", tone: "agent" },
              { label: "Runtime Governance", sub: "pre-execution", tone: "gov" },
              { label: "Verdict", sub: "ALLOW · BLOCK · ESCALATE", tone: "step" },
              { label: "Enterprise Systems", sub: "permitted only", tone: "system" },
            ]}
          />

          <p className="ig-fineprint">
            Product names on this page are used to illustrate common integration patterns and do not
            imply partnership or endorsement.
          </p>
        </div>
      </section>

      <hr className="divider" />

      {/* ── SECTION 2 — VerifyWise ── */}
      <section className="section section--tight ig" aria-label="Governance dashboard integration example">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Governance dashboard · VerifyWise-style</span>
            <h2>Governance Dashboard Integration</h2>
            <p>Verdicts surface inside the governance dashboard your risk team already uses — illustrated with a VerifyWise-style platform.</p>
          </div>
          <SvgFlow
            label="Governance dashboard to agent to Runtime Governance to risk evaluation to dashboard result"
            nodes={[
              { label: "Gov. Dashboard", sub: "VerifyWise-style", tone: "platform" },
              { label: "AI Agent", tone: "agent" },
              { label: "Runtime Governance", tone: "gov" },
              { label: "Risk Evaluation", tone: "step" },
              { label: "Result In Dashboard", tone: "system" },
            ]}
          />
          <BeforeAfter
            before={["Agent creates action.", "No runtime governance.", "Unsafe action reaches production."]}
            after={["Agent creates action.", "Runtime Governance evaluates the trajectory.", "Unsafe trajectory blocked.", "Risk surfaced inside the dashboard."]}
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
            <span className="eyebrow">CRM · Salesforce-style</span>
            <h2>CRM Workflow Integration</h2>
            <p>A customer requests a refund. The agent proposes a plan; governance evaluates it before anything executes — illustrated with a Salesforce-style CRM.</p>
          </div>
          <SvgFlow
            label="CRM to agent to proposed plan to Runtime Governance to block"
            nodes={[
              { label: "CRM Platform", sub: "Salesforce-style", tone: "platform" },
              { label: "AI Agent", sub: "refund request", tone: "agent" },
              { label: "Proposed Plan", sub: "read · refund · pay", tone: "step" },
              { label: "Runtime Governance", tone: "gov" },
              { label: "BLOCK", sub: "unauthorised refund", tone: "block" },
            ]}
          />
          <div className="ig-result reveal is-block">
            <span className="ig-result-k">Outcome</span>
            <p>The unauthorised refund trajectory is denied before execution — the payment never runs.</p>
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ── SECTION 4 — Customer support ── */}
      <section className="section section--tight ig" aria-label="Customer support agent example">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Customer support agent</span>
            <h2>Customer Support Agent Integration</h2>
            <p>An agent accesses customer records, then attempts external transmission.</p>
          </div>
          <SvgFlow
            label="Support agent to read records to external send to Runtime Governance to block"
            nodes={[
              { label: "Support Agent", tone: "agent" },
              { label: "Read Records", sub: "customer data", tone: "step" },
              { label: "External Send", sub: "egress attempt", tone: "step" },
              { label: "Runtime Governance", tone: "gov" },
              { label: "BLOCK", sub: "data exfiltration", tone: "block" },
            ]}
          />
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

      {/* ── SECTION 5 — Copilot ── */}
      <section className="section section--tight ig" aria-label="Copilot and internal agent integration">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Copilot &amp; internal agents</span>
            <h2>Copilot / Internal Agent Integration</h2>
            <p>Governance sits between any assistant and the enterprise tools it can act on — independent of the underlying model.</p>
          </div>
          <SvgFlow
            label="Copilot to Runtime Governance to enterprise tools"
            nodes={[
              { label: "Copilot", sub: "internal agent", tone: "agent" },
              { label: "Runtime Governance", tone: "gov" },
              { label: "Enterprise Tools", sub: "SharePoint · Outlook · CRM · DBs", tone: "system" },
            ]}
          />
          <p className="ig-modelagnostic reveal">
            <span className="ig-ma-dot" aria-hidden="true" /> Model-agnostic — works across GPT, Claude, Gemini, Llama, and Mistral, because governance is enforced at the execution boundary, not inside the model.
          </p>
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
              ["Integration", "Place governance at the agent's execution boundary."],
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
