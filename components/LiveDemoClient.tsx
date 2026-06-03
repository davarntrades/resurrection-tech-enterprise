"use client";

/* ============================================================
   Resurrection Tech™ — Live Runtime Governance console (/live-demo)
   An enterprise governance console that lets a CEO / CTO / CISO see
   Morrison Runtime Governance block unsafe AI-agent actions before
   execution. Built on the approved design tokens. Scenarios are
   derived from the public Morrison-Runtime-Governance repository.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { track } from "@/lib/analytics";
import {
  SCENARIOS,
  DECISION_META,
  EVIDENCE,
  type Scenario,
  type Decision,
} from "@/lib/live-demo-scenarios";

/* Phase timeline (ms) for the evaluation sequence. */
const TIMELINE = {
  plan: 360,
  trajectory: 900,
  evaluating: 1500,
  decision: 2600,
  audit: 3100,
} as const;

type Phase = 0 | 1 | 2 | 3 | 4 | 5;

interface AuditEntry {
  id: string;
  timestamp: string;
  scenario: string;
  action: string;
  decision: Decision;
  reason: string;
  riskCategory: string;
  layer: string;
}

function formatTimestamp(d: Date) {
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`
  );
}

export function LiveDemoClient() {
  const [active, setActive] = useState(0);
  const [phase, setPhase] = useState<Phase>(0);
  const [techView, setTechView] = useState(false);
  const [drillOpen, setDrillOpen] = useState(false);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const startedRef = useRef(false);
  const reduce = useReducedMotion();

  const scenario = useMemo<Scenario>(() => SCENARIOS[active], [active]);
  const meta = DECISION_META[scenario.decision];

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const logAudit = useCallback((s: Scenario) => {
    setAudit((prev) => {
      const entry: AuditEntry = {
        id: `EVT-${s.id.slice(0, 4).toUpperCase()}-${String(
          Date.now() % 100000,
        ).padStart(5, "0")}`,
        timestamp: formatTimestamp(new Date()),
        scenario: s.title,
        action: s.trajectory.map((t) => t.tool).join(" → "),
        decision: s.decision,
        reason: s.reason,
        riskCategory: s.tech.riskCategory,
        layer: s.tech.layer,
      };
      return [entry, ...prev].slice(0, 12);
    });
  }, []);

  const run = useCallback(
    (index: number) => {
      clearTimers();
      const s = SCENARIOS[index];
      setActive(index);
      setDrillOpen(false);

      if (reduce) {
        setPhase(5);
        logAudit(s);
        return;
      }

      setPhase(0);
      const at = (p: Phase, ms: number) =>
        timers.current.push(setTimeout(() => setPhase(p), ms));
      at(1, TIMELINE.plan);
      at(2, TIMELINE.trajectory);
      at(3, TIMELINE.evaluating);
      at(4, TIMELINE.decision);
      timers.current.push(
        setTimeout(() => {
          setPhase(5);
          logAudit(s);
        }, TIMELINE.audit),
      );
    },
    [clearTimers, reduce, logAudit],
  );

  const select = useCallback(
    (index: number) => {
      track("live_demo_scenario", {
        scenario: SCENARIOS[index].id,
        decision: SCENARIOS[index].decision,
      });
      run(index);
    },
    [run],
  );

  // Auto-play the first scenario shortly after mount.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const t = setTimeout(() => run(0), 420);
    return () => clearTimeout(t);
  }, [run]);

  useEffect(() => clearTimers, [clearTimers]);

  const evaluating = phase >= 3 && phase < 4;
  const resolved = phase >= 4;
  const showTech = techView || drillOpen;

  return (
    <div className="ld">
      {/* ───────────────── Hero ───────────────── */}
      <header className="ld-hero">
        <span className="eyebrow">Live demo · Runtime Governance™</span>
        <h1 className="ld-title">
          Watch unsafe AI-agent actions get stopped{" "}
          <span className="ld-title-accent">before they execute.</span>
        </h1>
        <p className="ld-lede">
          This is the governance layer that sits between an AI agent's plan and
          your tools. Pick a scenario and see exactly what the agent proposed,
          what Runtime Governance decided, and the business consequence it
          avoided — in plain language, with the technical evidence one click
          away.
        </p>

        <div className="ld-cta">
          <Link
            href="/book#assessment"
            className="btn btn--primary"
            onClick={() => track("cta_click", { location: "live-demo-hero", cta: "assessment" })}
          >
            Book a Runtime Safety Assessment <span className="arr">→</span>
          </Link>
          <a
            href={EVIDENCE.repo}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--ghost"
            onClick={() => track("cta_click", { location: "live-demo-hero", cta: "github" })}
          >
            View GitHub evidence
          </a>
          <Link
            href="/integrations"
            className="btn btn--ghost"
            onClick={() => track("cta_click", { location: "live-demo-hero", cta: "integrations" })}
          >
            See integrations
          </Link>
        </div>

        <div className="ld-legend" aria-hidden="true">
          <span className="ld-legend-item ld-legend--allow">
            <i /> ALLOW — safe workflow permitted
          </span>
          <span className="ld-legend-item ld-legend--escalate">
            <i /> ESCALATE — human review required
          </span>
          <span className="ld-legend-item ld-legend--block">
            <i /> BLOCK — unsafe action stopped
          </span>
        </div>
      </header>

      {/* ───────────────── Console ───────────────── */}
      <section className="ld-console" aria-label="Runtime Governance console">
        {/* Console header bar */}
        <div className="ld-console-bar">
          <span className="ld-dot ld-dot--a" aria-hidden="true" />
          <span className="ld-dot ld-dot--b" aria-hidden="true" />
          <span className="ld-dot ld-dot--c" aria-hidden="true" />
          <span className="ld-console-name">
            morrison · runtime-governance · pre-execution console
          </span>
          <label className="ld-toggle">
            <input
              type="checkbox"
              checked={techView}
              onChange={(e) => {
                setTechView(e.target.checked);
                track("live_demo_techview", { on: e.target.checked });
              }}
            />
            <span className="ld-toggle-track" aria-hidden="true">
              <span className="ld-toggle-thumb" />
            </span>
            Technical view
          </label>
        </div>

        <div className="ld-grid">
          {/* ── Scenario selector ── */}
          <nav className="ld-scenarios" aria-label="Scenarios">
            <div className="ld-scenarios-h">Scenarios</div>
            {SCENARIOS.map((s, i) => {
              const m = DECISION_META[s.decision];
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`ld-scn ld-scn--${m.tone}${active === i ? " is-active" : ""}`}
                  aria-pressed={active === i}
                  onClick={() => select(i)}
                >
                  <span className="ld-scn-dot" aria-hidden="true" />
                  <span className="ld-scn-body">
                    <span className="ld-scn-title">{s.title}</span>
                    <span className="ld-scn-tag">{m.label}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          {/* ── Stage ── */}
          <div className="ld-stage" data-decision={resolved ? scenario.decision : undefined}>
            {/* User request */}
            <Block label="User request" step="01" lit={phase >= 0}>
              <p className="ld-request">{scenario.request}</p>
            </Block>

            {/* AI agent proposed plan */}
            <Block label="AI agent · proposed plan" step="02" lit={phase >= 1}>
              <ol className="ld-plan">
                {scenario.plan.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ol>
            </Block>

            {/* Proposed tool/action trajectory */}
            <Block label="Proposed tool action" step="03" lit={phase >= 2}>
              <ul className="ld-traj">
                {scenario.trajectory.map((t, i) => (
                  <li key={i} className="ld-traj-step">
                    {t.agent && (
                      <span className="ld-traj-agent">
                        Agent {t.agent}
                        {t.role ? ` · ${t.role}` : ""}
                      </span>
                    )}
                    <code className="ld-traj-call">
                      <span className="ld-traj-tool">{t.tool}</span>
                      <span className="ld-traj-args">{t.args}</span>
                    </code>
                    {t.note && <span className="ld-traj-note">{t.note}</span>}
                  </li>
                ))}
              </ul>
            </Block>

            {/* Trajectory visual */}
            <TrajectoryVisual scenario={scenario} phase={phase} />

            {/* Governance evaluation + decision */}
            <Block
              label="Runtime Governance evaluation"
              step="04"
              lit={phase >= 3}
              tone={resolved ? meta.tone : undefined}
            >
              {!resolved && (
                <p className="ld-evaluating">
                  {evaluating ? (
                    <>
                      <span className="ld-spin" aria-hidden="true" />
                      Evaluating reachable future states — does the trajectory
                      reach a forbidden state Ω?
                    </>
                  ) : (
                    "Awaiting trajectory…"
                  )}
                </p>
              )}

              {resolved && (
                <div className={`ld-decision ld-decision--${meta.tone}`}>
                  <div className="ld-decision-head">
                    <span className="ld-decision-word">{meta.label}</span>
                    <span className="ld-decision-verb">{meta.verb}</span>
                  </div>
                  <p className="ld-decision-reason">{scenario.reason}</p>
                  <div className="ld-decision-omega">
                    <span className="ld-omega-k">Ω boundary</span>
                    <span className="ld-omega-v">{scenario.omega}</span>
                    <span className="ld-omega-k">Reachability</span>
                    <span className="ld-omega-v">
                      {scenario.reachable
                        ? "Forbidden outcome reachable — blocked"
                        : "Forbidden outcome NOT reachable"}
                    </span>
                  </div>
                </div>
              )}
            </Block>

            {/* Business impact */}
            {resolved && (
              <Block label="Business impact" step="05" lit tone={meta.tone}>
                <p className="ld-impact">{scenario.businessImpact}</p>
                {scenario.consequenceAvoided && (
                  <p className="ld-impact-sub">
                    <span className="ld-impact-k">
                      {scenario.decision === "ALLOW"
                        ? "Outcome"
                        : "Consequence avoided"}
                    </span>
                    {scenario.consequenceAvoided}
                  </p>
                )}
                <ul className="ld-assets">
                  {scenario.protectedAssets.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </Block>
            )}

            {/* Technical drilldown */}
            {resolved && (
              <div className="ld-drill">
                <button
                  type="button"
                  className="ld-drill-toggle"
                  aria-expanded={showTech}
                  onClick={() => setDrillOpen((v) => !v)}
                >
                  <span className="ld-drill-chev" data-open={showTech}>
                    ▸
                  </span>
                  Technical drilldown
                  <span className="ld-drill-hint">
                    risk category · layer · trajectory · repo evidence
                  </span>
                </button>
                {showTech && (
                  <dl className="ld-drill-body">
                    <div>
                      <dt>Risk category</dt>
                      <dd>{scenario.tech.riskCategory}</dd>
                    </div>
                    <div>
                      <dt>Ω domain</dt>
                      <dd>{scenario.tech.omegaDomain}</dd>
                    </div>
                    <div>
                      <dt>Governance layer triggered</dt>
                      <dd className="ld-mono">{scenario.tech.layer}</dd>
                    </div>
                    <div>
                      <dt>Rule</dt>
                      <dd className="ld-mono">{scenario.tech.rule}</dd>
                    </div>
                    <div className="ld-drill-wide">
                      <dt>Trajectory explanation</dt>
                      <dd>{scenario.tech.trajectoryExplanation}</dd>
                    </div>
                    <div className="ld-drill-wide">
                      <dt>Repo evidence</dt>
                      <dd>
                        <a
                          href={scenario.tech.evidenceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ld-link"
                        >
                          {scenario.tech.evidenceRef} ↗
                        </a>
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
            )}

            {/* Replay */}
            <div className="ld-controls">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => run(active)}
                disabled={evaluating}
              >
                {evaluating ? "Evaluating…" : "Replay evaluation"}
              </button>
              <span className="ld-controls-note">
                Nothing is ever executed — the layer only inspects the proposed
                trajectory.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────── Audit log ───────────────── */}
      <section className="ld-panel" aria-label="Audit log">
        <div className="ld-panel-h">
          <h2>Audit log</h2>
          <span className="ld-panel-sub">
            Every evaluation produces a timestamped, layer-attributed,
            replayable record.
          </span>
        </div>
        <div className="ld-audit" role="log" aria-live="polite">
          {audit.length === 0 ? (
            <p className="ld-audit-empty">Run a scenario to generate the first audit entry.</p>
          ) : (
            <table className="ld-audit-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Scenario</th>
                  <th>Action</th>
                  <th>Decision</th>
                  <th>Risk category</th>
                  <th>Layer</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((e) => (
                  <tr key={e.id} className={`ld-audit-row ld-audit-row--${DECISION_META[e.decision].tone}`}>
                    <td className="ld-mono ld-audit-ts">{e.timestamp}</td>
                    <td>{e.scenario}</td>
                    <td className="ld-mono">{e.action}</td>
                    <td>
                      <span className={`ld-badge ld-badge--${DECISION_META[e.decision].tone}`}>
                        {e.decision}
                      </span>
                    </td>
                    <td>{e.riskCategory}</td>
                    <td className="ld-mono">{e.layer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ───────────────── Evidence ───────────────── */}
      <section className="ld-panel" aria-label="Evidence">
        <div className="ld-panel-h">
          <h2>Evidence</h2>
          <span className="ld-panel-sub">
            This demo mirrors the public Morrison Runtime Governance repository.
          </span>
        </div>

        <div className="ld-evidence">
          <div className="ld-ev-stats">
            <Stat v={EVIDENCE.evaluations} l="Governed evaluations" />
            <Stat v={EVIDENCE.falsePositives} l="False positives (test suite)" />
            <Stat v={EVIDENCE.falseNegatives} l="False negatives (test suite)" />
            <Stat v={EVIDENCE.testFunctions} l="Test functions" />
            <Stat v={EVIDENCE.multiAgentScenarios} l="Multi-agent scenarios" />
          </div>

          <div className="ld-ev-meta">
            <div className="ld-ev-card">
              <span className="ld-ev-k">Repository</span>
              <a href={EVIDENCE.repo} target="_blank" rel="noopener noreferrer" className="ld-link">
                Morrison-Runtime-Governance ↗
              </a>
              <p className="ld-ev-models">Tested planners: {EVIDENCE.models}</p>
            </div>
            <div className="ld-ev-card">
              <span className="ld-ev-k">Latest commit</span>
              <a href={EVIDENCE.latestCommit.url} target="_blank" rel="noopener noreferrer" className="ld-link ld-mono">
                {EVIDENCE.latestCommit.sha} ↗
              </a>
              <p className="ld-ev-commit">
                {EVIDENCE.latestCommit.summary}
                <span className="ld-ev-date"> · {EVIDENCE.latestCommit.date}</span>
              </p>
            </div>
            <div className="ld-ev-card">
              <span className="ld-ev-k">Layer hierarchy</span>
              <ul className="ld-ev-layers">
                {EVIDENCE.layers.map((ly) => (
                  <li key={ly.id}>
                    <code>{ly.id}</code> {ly.desc}
                  </li>
                ))}
              </ul>
            </div>
            <div className="ld-ev-card">
              <span className="ld-ev-k">Patents</span>
              <p className="ld-mono ld-ev-patents">{EVIDENCE.patents}</p>
              <div className="ld-ev-links">
                <Link href="/evidence" className="ld-link">
                  Full evidence &amp; methodology →
                </Link>
                <Link href="/test-trajectory" className="ld-link">
                  Test your own trajectory →
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="ld-disclaimer">
          Scenarios, taxonomy, tool trajectories and layer attribution are
          derived from the public Morrison Runtime Governance repository. This
          page is a faithful demonstration: it runs entirely in your browser,
          exposes no secrets, requires no private infrastructure, and never
          executes any tool call.
        </div>
      </section>

      {/* ───────────────── Closing CTA ───────────────── */}
      <section className="ld-closing">
        <h2>See it run against your own agent architecture.</h2>
        <p>
          The 48-hour Runtime Safety Assessment evaluates your real tool-call
          plans as trajectories — which catastrophic states are reachable, what
          executes, what is intercepted, and why.
        </p>
        <div className="ld-cta">
          <Link
            href="/book#assessment"
            className="btn btn--primary"
            onClick={() => track("cta_click", { location: "live-demo-closing", cta: "assessment" })}
          >
            Book a Runtime Safety Assessment <span className="arr">→</span>
          </Link>
          <a href={EVIDENCE.repo} target="_blank" rel="noopener noreferrer" className="btn btn--ghost">
            View GitHub evidence
          </a>
          <Link href="/integrations" className="btn btn--ghost">
            See integrations
          </Link>
        </div>
      </section>
    </div>
  );
}

/* ───────────────── Sub-components ───────────────── */

function Block({
  label,
  step,
  lit,
  tone,
  children,
}: {
  label: string;
  step: string;
  lit: boolean;
  tone?: "block" | "allow" | "escalate";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`ld-block${lit ? " is-lit" : ""}${tone ? ` ld-block--${tone}` : ""}`}
    >
      <div className="ld-block-head">
        <span className="ld-block-step">{step}</span>
        <span className="ld-block-label">{label}</span>
      </div>
      <div className="ld-block-body">{children}</div>
    </div>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  return (
    <div className="ld-stat">
      <div className="ld-stat-v">{v}</div>
      <div className="ld-stat-l">{l}</div>
    </div>
  );
}

/** Trajectory pipeline visual. Single-agent or multi-agent (joint) variant. */
function TrajectoryVisual({ scenario, phase }: { scenario: Scenario; phase: Phase }) {
  const resolved = phase >= 4;
  const meta = DECISION_META[scenario.decision];
  const flowing = phase >= 2;

  if (scenario.multiAgent) {
    const agents = scenario.trajectory;
    return (
      <div className={`ld-flow ld-flow--multi${resolved ? ` is-${meta.tone}` : ""}`} aria-hidden="true">
        <div className="ld-flow-agents">
          {agents.map((a, i) => (
            <div className="ld-flow-agent" key={i} data-lit={flowing}>
              <span className="ld-flow-aid">Agent {a.agent}</span>
              <span className="ld-flow-arole">{a.role}</span>
              <span className="ld-flow-atool">{a.tool}</span>
            </div>
          ))}
        </div>
        <FlowArrow lit={flowing} />
        <div className="ld-flow-node ld-flow-node--combine" data-lit={phase >= 3}>
          Combined trajectory
        </div>
        <FlowArrow lit={resolved} tone={meta.tone} />
        <div className={`ld-flow-node ld-flow-node--decision ld-flow--${meta.tone}`} data-lit={resolved}>
          {resolved ? meta.label : "Runtime Governance"}
        </div>
      </div>
    );
  }

  return (
    <div className={`ld-flow${resolved ? ` is-${meta.tone}` : ""}`} aria-hidden="true">
      <div className="ld-flow-node" data-lit={phase >= 0}>User request</div>
      <FlowArrow lit={phase >= 1} />
      <div className="ld-flow-node" data-lit={phase >= 1}>AI agent</div>
      <FlowArrow lit={phase >= 2} />
      <div className="ld-flow-node" data-lit={phase >= 2}>Proposed action</div>
      <FlowArrow lit={phase >= 3} />
      <div className="ld-flow-node ld-flow-node--gate" data-lit={phase >= 3}>
        <span className="ld-flow-omega">Ω</span>
        Runtime Governance
      </div>
      <FlowArrow lit={resolved} tone={meta.tone} />
      <div className={`ld-flow-node ld-flow-node--decision ld-flow--${meta.tone}`} data-lit={resolved}>
        {resolved ? meta.label : "Decision"}
      </div>
    </div>
  );
}

function FlowArrow({ lit, tone }: { lit: boolean; tone?: "block" | "allow" | "escalate" }) {
  return (
    <span className={`ld-flow-arrow${lit ? " is-lit" : ""}${tone ? ` ld-flow-arrow--${tone}` : ""}`}>
      →
    </span>
  );
}
