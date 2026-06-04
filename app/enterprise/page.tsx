import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { INTEGRATION_SNIPPET } from "@/lib/live-demo-scenarios";

export const metadata: Metadata = {
  title: "Enterprise Readiness",
  description:
    "How Morrison Runtime Governance integrates into existing agent stacks (OpenAI Agents, LangGraph, LangChain, AutoGen, MCP, custom orchestrators), its operational performance model, configurable Ω rules, multi-agent governance, and the 48-hour Runtime Safety Assessment.",
  alternates: { canonical: "/enterprise" },
};

/* ── Reused SVG flow (same tokens/classes as /integrations) ── */
type Tone = "platform" | "agent" | "gov" | "system" | "allow" | "block" | "escalate" | "step";
type FlowNode = { label: string; sub?: string; tone: Tone };
const NODE_W = 158, NODE_H = 64, GAP = 50, PAD = 16;
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
          <marker id="entArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="ig-svg-arrowhead" />
          </marker>
        </defs>
        {nodes.map((node, i) => {
          const x = PAD + i * (NODE_W + GAP);
          const next = i < n - 1;
          return (
            <g key={node.label + i}>
              {next && <line className="ig-svg-conn" x1={x + NODE_W} y1={cy + NODE_H / 2} x2={x + NODE_W + GAP} y2={cy + NODE_H / 2} markerEnd="url(#entArrow)" />}
              <rect className={`ig-svg-node tone-${node.tone}`} x={x} y={cy} width={NODE_W} height={NODE_H} rx="11" />
              <text className={`ig-svg-label tone-${node.tone}`} x={x + NODE_W / 2} y={node.sub ? cy + NODE_H / 2 - 4 : cy + NODE_H / 2 + 4} textAnchor="middle">{node.label}</text>
              {node.sub && <text className="ig-svg-sub" x={x + NODE_W / 2} y={cy + NODE_H / 2 + 15} textAnchor="middle">{node.sub}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const FRAMEWORKS: [string, string][] = [
  ["OpenAI Agents", "Gate function/tool-call dispatch: pass the proposed tool calls to the governance check before the runtime executes them."],
  ["LangGraph", "Insert a governance node before the tool node; route on the verdict (continue on ALLOW, interrupt on BLOCK/ESCALATE)."],
  ["LangChain", "Guard the AgentExecutor's tool invocation — a pre-tool callback/guard that runs before `tool.run`."],
  ["AutoGen", "Evaluate proposed tool calls in the agent's execute step before function execution proceeds."],
  ["MCP-based systems", "Evaluate the tool call at the MCP client/host before it is forwarded to the MCP server."],
  ["Custom orchestrators", "Call the governance API at your plan → act boundary; proceed only on ALLOW."],
  ["Internal tool frameworks", "One pre-dispatch check in your tool router: deny on BLOCK, route to a human on ESCALATE."],
];

const DOMAINS: [string, string[]][] = [
  ["Finance", ["Unauthorized transfers", "Fraud states (structuring, velocity)", "Regulatory violations"]],
  ["Healthcare", ["PHI disclosure", "Unsafe treatment / clinical states"]],
  ["Cybersecurity", ["Credential exfiltration", "Privilege escalation", "Shell / command injection"]],
  ["Enterprise", ["Customer-data leakage", "Unauthorized actions", "Internal artifact egress"]],
];

export default function Page() {
  return (
    <PageShell>
      {/* Hero */}
      <section className="section section--tight ent" aria-label="Enterprise readiness">
        <div className="wrap">
          <span className="eyebrow">Enterprise readiness</span>
          <h1 className="ent-h1">Built to drop into the stack you already run.</h1>
          <p className="ent-lede">
            The questions a CTO, CISO, Head of AI, or risk committee asks after the live demo —
            how it integrates, how fast it is, how configurable it is, what happens across agents,
            and where to start. Answered directly, without overstating what has been measured.
          </p>
          <div className="ent-cta">
            <Link href="/live-demo" className="btn btn--primary">Try the live demo <span className="arr">→</span></Link>
            <Link href="/book#assessment" className="btn btn--ghost">Book a Runtime Safety Assessment</Link>
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* 1 — Enterprise Integration */}
      <section className="section section--tight ent" id="integration" aria-label="Enterprise integration">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">01 · Integration effort</span>
            <h2>Enterprise Integration</h2>
            <p>Runtime Governance is a pre-execution check at your tool-dispatch boundary. Your agents, planners, and models stay exactly as they are.</p>
          </div>

          <SvgFlow
            label="Agent to planner to Morrison Runtime Governance to verdict to tool execution"
            nodes={[
              { label: "Agent", tone: "agent" },
              { label: "Planner", sub: "proposes tool calls", tone: "step" },
              GOV,
              { label: "ALLOW / BLOCK", sub: "ESCALATE", tone: "step" },
              { label: "Tool Execution", sub: "permitted only", tone: "system" },
            ]}
          />

          <ul className="ent-chips reveal">
            {["No model retraining", "No fine-tuning required", "Model-agnostic", "Sits between planning and execution", "Existing agents unchanged"].map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>

          <div className="section-head reveal" style={{ marginTop: "var(--gutter)" }}>
            <h3 className="ent-h3">Integration patterns by stack</h3>
            <p>The hook is the same everywhere — evaluate the proposed tool call(s) before dispatch. These are integration patterns at the execution boundary, not vendor-certified plugins.</p>
          </div>
          <div className="ent-fw-grid reveal">
            {FRAMEWORKS.map(([name, hook]) => (
              <div className="ent-fw" key={name}>
                <div className="ent-fw-h">{name}</div>
                <p>{hook}</p>
              </div>
            ))}
          </div>

          <div className="ent-code reveal">
            <div className="ent-code-h">The check is one call before execution</div>
            <pre><code>{INTEGRATION_SNIPPET}</code></pre>
            <p className="ent-code-note">Or call the governance HTTP service from any language — see <Link href="/integrations" className="ent-link">integration examples</Link>.</p>
          </div>

          <p className="ent-answer reveal"><b>How much work for my team?</b> A single pre-execution check at the point where your agent dispatches tools. No changes to the model or the agent's reasoning.</p>
        </div>
      </section>

      <hr className="divider" />

      {/* 2 — Operational Performance */}
      <section className="section section--tight ent" id="performance" aria-label="Operational performance">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">02 · Latency</span>
            <h2>Operational Performance</h2>
            <p>Governance runs before the tool executes, as lightweight middleware. The decision returns before any action is taken.</p>
          </div>

          <div className="ent-perf-grid reveal">
            {[
              ["Pre-execution", "The verdict is computed and returned before the tool call runs — not after the fact."],
              ["Lightweight middleware", "A bounded evaluation over the proposed trajectory; no model inference in the governance path."],
              ["Independent of model size", "Runs the same whether the planner is a 7B or a frontier model — it evaluates the trajectory, not the weights."],
              ["Cost tracks trajectory complexity", "Runtime cost scales with the number and shape of proposed steps, not LLM parameter count."],
            ].map(([h, p]) => (
              <div className="ent-perf" key={h}><div className="ent-perf-h">{h}</div><p>{p}</p></div>
            ))}
          </div>

          <div className="ent-bench reveal">
            <div className="ent-bench-h">
              <span>Latency benchmarks</span>
              <span className="ent-bench-tag">Benchmarks pending — published after the standardized suite runs</span>
            </div>
            <table className="ent-bench-table">
              <thead>
                <tr><th>Evaluation class</th><th>Median</th><th>p95</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {[
                  ["Single-step evaluation", "single proposed tool call"],
                  ["Multi-step trajectory evaluation", "a chained plan"],
                  ["Multi-agent evaluation", "joint / flattened trajectory"],
                  ["Worst-case evaluation", "deepest configured horizon"],
                ].map(([cls, note]) => (
                  <tr key={cls}>
                    <td className="t-main">{cls}</td>
                    <td className="ent-tbd">— pending —</td>
                    <td className="ent-tbd">— pending —</td>
                    <td className="ent-note">{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="ent-bench-foot">We publish measured figures rather than estimates. Numbers will be added here once the benchmark suite is run on representative hardware.</p>
          </div>

          <p className="ent-answer reveal"><b>Will this slow my production systems?</b> The check is a bounded pre-execution step independent of model size. Measured latency figures are published above once benchmarked — we don&rsquo;t quote numbers we haven&rsquo;t measured.</p>
        </div>
      </section>

      <hr className="divider" />

      {/* 3 — Domain-Specific Governance */}
      <section className="section section--tight ent" id="custom-omega" aria-label="Domain-specific governance">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">03 · Custom Ω rules</span>
            <h2>Domain-Specific Governance</h2>
            <p>The enforcement invariant is fixed; the forbidden region Ω is configurable for your domain and policies.</p>
          </div>

          <div className="ent-invariant reveal">
            <span className="ent-inv-eq">ℛ(t) ∩ Ω = ∅</span>
            <span className="ent-inv-cap">The reachable set of a trajectory must never intersect the forbidden region. Ω is defined per domain.</span>
          </div>

          <SvgFlow
            label="Customer policies to Omega registry to Runtime Governance to verdict"
            nodes={[
              { label: "Customer Policies", sub: "your rules", tone: "platform" },
              { label: "Ω Registry", sub: "forbidden states", tone: "step" },
              GOV,
              { label: "ALLOW / BLOCK", tone: "step" },
            ]}
          />

          <div className="ent-dom-grid reveal">
            {DOMAINS.map(([name, items]) => (
              <div className="ent-dom" key={name}>
                <div className="ent-dom-h">{name}</div>
                <ul>{items.map((i) => <li key={i}>{i}</li>)}</ul>
              </div>
            ))}
          </div>
          <p className="ent-fine reveal">Finance, cybersecurity, healthcare, data-privacy, enterprise, compliance and fraud Ω rule sets are implemented in the live engine today; other sectors are target deployment domains with Ω rules pending. See the <Link href="/live-demo" className="ent-link">live demo</Link> to evaluate against the implemented domains.</p>

          <p className="ent-answer reveal"><b>Can this work in my environment?</b> Yes — the mechanism stays constant while you define Ω from your own regulatory and operational policy. New domains are added as rule sets, not as engine rewrites.</p>
        </div>
      </section>

      <hr className="divider" />

      {/* 4 — Multi-Agent & Orchestration */}
      <section className="section section--tight ent" id="multi-agent" aria-label="Multi-agent and orchestration governance">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">04 · Orchestration layers</span>
            <h2>Multi-Agent &amp; Orchestration Governance</h2>
            <p>Harm often appears only in the <b>combination</b> of actions across agents — never in any single step. Runtime Governance evaluates trajectories, not isolated actions.</p>
          </div>

          <SvgFlow
            label="Agent A to shared memory to Agent B to execution, blocked"
            nodes={[
              { label: "Agent A", sub: "acquires data", tone: "agent" },
              { label: "Shared Memory", sub: "stages it", tone: "step" },
              { label: "Agent B", sub: "egresses", tone: "agent" },
              GOV,
              { label: "BLOCKED", sub: "joint trajectory", tone: "block" },
            ]}
          />

          <div className="ent-risks reveal">
            {[
              ["Shared-memory propagation", "Sensitive data staged by one agent and moved by another."],
              ["Delegated execution", "A delegate / orchestrate step that expands into an unsafe action."],
              ["Cross-agent escalation", "Privilege or capability that grows across a hand-off chain."],
              ["Cascading failures", "Each agent locally admissible; the joint path reaches Ω."],
              ["Multi-step trajectories", "Risk that accrues over a sequence, invisible to per-call checks."],
            ].map(([h, p]) => (
              <div className="ent-risk" key={h}><span className="ent-risk-dot" aria-hidden="true" /><div><b>{h}</b><span>{p}</span></div></div>
            ))}
          </div>

          <div className="ent-quote reveal">Each agent appeared safe in isolation. The combined trajectory was unsafe. Governance evaluates the entire pipeline before execution.</div>

          <div className="ent-cta reveal">
            <Link href="/live-demo?scenario=multi-agent-failure" className="btn btn--primary">See the multi-agent scenario <span className="arr">→</span></Link>
          </div>

          <p className="ent-answer reveal"><b>What happens when multiple agents interact?</b> Their steps are flattened into one joint trajectory and governed together — shared-memory, delegation, and cross-agent chains are evaluated as a whole, not as isolated, individually-innocent actions.</p>
        </div>
      </section>

      <hr className="divider" />

      {/* 5 — 48-Hour Assessment */}
      <section className="section section--tight ent" id="assessment" aria-label="48-hour runtime safety assessment">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">05 · Where to start</span>
            <h2>48-Hour Runtime Safety Assessment</h2>
            <p>The standard first engagement. A scoped review of your agent environment — no deployment commitment required.</p>
          </div>

          <div className="ent-deliv reveal">
            <div className="ent-deliv-k">Deliverables</div>
            <div className="ent-deliv-grid">
              {[
                "Architecture review", "Agent inventory", "Tool inventory", "Ω mapping",
                "Threat analysis", "Runtime evaluation", "Executive report", "Pilot recommendation",
              ].map((d) => <div className="ent-deliv-cell" key={d}><span className="ent-deliv-tick" aria-hidden="true">✓</span>{d}</div>)}
            </div>
          </div>

          <div className="ent-determine reveal">
            <div className="ent-determine-h">The assessment determines</div>
            <ul>
              <li>What would be <b>blocked</b> in your environment today.</li>
              <li>What would be <b>allowed</b>.</li>
              <li>What risks exist in your current agent architecture.</li>
              <li>Whether a runtime-governance implementation makes sense for you.</li>
            </ul>
          </div>

          <div className="ent-retain reveal">
            Even if you choose not to proceed, you retain a professional risk assessment of your agent environment.
          </div>

          <div className="ent-cta reveal">
            <Link href="/book#assessment" className="btn btn--primary">Book a Runtime Safety Assessment <span className="arr">→</span></Link>
            <Link href="/sample-audit" className="btn btn--ghost">See a sample report</Link>
          </div>

          <p className="ent-answer reveal"><b>Why buy the assessment first?</b> It turns an open question into a concrete, evidence-based map of your exposure — and you keep that assessment regardless of whether you deploy.</p>
        </div>
      </section>

      <hr className="divider" />

      {/* Closing */}
      <section className="section section--tight ent" aria-label="Next steps">
        <div className="wrap">
          <div className="ent-closing reveal">
            <h2>Trust the boundary, not the promise.</h2>
            <p>Run the live console, then have us evaluate your own agent architecture.</p>
            <div className="ent-cta">
              <Link href="/live-demo" className="btn btn--primary">Try the live demo <span className="arr">→</span></Link>
              <Link href="/book#assessment" className="btn btn--ghost">Book a Runtime Safety Assessment</Link>
              <a href="https://github.com/davarntrades/Morrison-Runtime-Governance" target="_blank" rel="noopener noreferrer" className="btn btn--ghost">View GitHub evidence</a>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
