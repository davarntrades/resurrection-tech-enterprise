"use client";

/* ============================================================
   Resurrection Tech™ — Runtime Governance Console (/live-demo)
   A deployable-feeling enterprise governance console: scenario
   library → live scenario definition → simulate trajectory check →
   animated reachability map → governance verdict → live audit log →
   evidence drawer. CEO / Technical mode toggle.

   Scenarios, taxonomy, trajectories, layer attribution and the
   verdict vocabulary are derived from the public Morrison Runtime
   Governance repository. Nothing is ever executed.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { track } from "@/lib/analytics";
import {
  SCENARIOS,
  DECISION_META,
  EVIDENCE,
  INTEGRATION_SNIPPET,
  type Scenario,
  type Decision,
} from "@/lib/live-demo-scenarios";

type Phase = 0 | 1 | 2 | 3;
type Mode = "ceo" | "tech";

interface AuditEvent {
  id: string;
  time: string;
  event: string;
  detail: string;
  tone?: "block" | "allow" | "escalate" | "info";
}

function clock(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

let _evt = 0;
const evtId = () => `e${Date.now().toString(36)}${(_evt++).toString(36)}`;

export function LiveDemoClient() {
  const [active, setActive] = useState(0);
  const [phase, setPhase] = useState<Phase>(0);
  const [mode, setMode] = useState<Mode>("ceo");
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const startedRef = useRef(false);
  const reduce = useReducedMotion();

  const scenario = useMemo<Scenario>(() => SCENARIOS[active], [active]);
  const meta = DECISION_META[scenario.decision];
  const resolved = phase >= 3;

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const log = useCallback((event: string, detail: string, tone: AuditEvent["tone"] = "info") => {
    setAudit((prev) =>
      [{ id: evtId(), time: clock(), event, detail, tone }, ...prev].slice(0, 14),
    );
  }, []);

  const simulate = useCallback(
    (s: Scenario) => {
      clearTimers();
      const m = DECISION_META[s.decision];
      track("live_demo_simulate", { scenario: s.id, decision: s.decision });

      const reach = () => {
        if (s.decision === "BLOCK") log("Ω reachability detected", s.omega, "block");
        else if (s.decision === "ESCALATE") log("Regulatory boundary classified", s.omega, "escalate");
        else log("Safe path found", "ℛ(t) ∩ Ω = ∅", "allow");
      };
      const verdict = () => log(`${m.label} issued`, s.reason, m.tone);

      if (reduce) {
        setPhase(3);
        log("Trajectory generated", s.toolCalls.join("  ·  "));
        reach();
        verdict();
        return;
      }

      setPhase(1);
      log("Trajectory generated", s.toolCalls.join("  ·  "));
      timers.current.push(setTimeout(() => {
        setPhase(2);
        log("Reachability evaluated", "Reachable-set ℛ(t) vs forbidden region Ω");
      }, 900));
      timers.current.push(setTimeout(() => reach(), 1900));
      timers.current.push(setTimeout(() => {
        setPhase(3);
        verdict();
      }, 2300));
    },
    [clearTimers, reduce, log],
  );

  const select = useCallback(
    (index: number) => {
      clearTimers();
      const s = SCENARIOS[index];
      setActive(index);
      setPhase(0);
      track("live_demo_scenario", { scenario: s.id, decision: s.decision });
      log("Scenario selected", s.title);
    },
    [clearTimers, log],
  );

  // Auto-run the first scenario once on mount so a passive visitor sees the
  // mechanism — subsequent selections wait for the Simulate CTA.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    log("Scenario selected", SCENARIOS[0].title);
    const t = setTimeout(() => simulate(SCENARIOS[0]), 700);
    return () => clearTimeout(t);
  }, [simulate, log]);

  useEffect(() => clearTimers, [clearTimers]);

  // Lock scroll when the evidence drawer is open.
  useEffect(() => {
    document.body.style.overflow = evidenceOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [evidenceOpen]);

  return (
    <div className={`rgx rgx--${mode}`} data-decision={resolved ? scenario.decision : undefined}>
      {/* ───────────────── Header ───────────────── */}
      <header className="rgx-head">
        <div className="rgx-head-l">
          <span className="eyebrow">Runtime Governance™ · Live console</span>
          <h1 className="rgx-title">
            Unsafe AI-agent actions, stopped{" "}
            <span className="rgx-title-accent">before they execute.</span>
          </h1>
          <p className="rgx-lede">
            A pre-execution governance layer that sits between an AI agent's plan
            and your tools. Pick a scenario, run the trajectory check, and see
            exactly what the agent tried, what was decided, and the damage
            avoided.
          </p>
        </div>
        <div className="rgx-head-r">
          <div className="rgx-modeswitch" role="tablist" aria-label="View mode">
            <button
              role="tab"
              aria-selected={mode === "ceo"}
              className={`rgx-mode${mode === "ceo" ? " is-on" : ""}`}
              onClick={() => { setMode("ceo"); track("live_demo_mode", { mode: "ceo" }); }}
            >
              CEO mode
            </button>
            <button
              role="tab"
              aria-selected={mode === "tech"}
              className={`rgx-mode${mode === "tech" ? " is-on" : ""}`}
              onClick={() => { setMode("tech"); track("live_demo_mode", { mode: "tech" }); }}
            >
              Technical mode
            </button>
          </div>
          <button className="rgx-evidence-btn" onClick={() => setEvidenceOpen(true)}>
            <span className="rgx-ev-dot" aria-hidden="true" /> View evidence
          </button>
        </div>
      </header>

      {/* ───────────────── Panel 1 · Scenario library ───────────────── */}
      <section className="rgx-section" aria-label="Scenario library">
        <PanelHead n="01" title="Scenario library" sub="Real governance scenarios from the Morrison repository." />
        <div className="rgx-cards">
          {SCENARIOS.map((s, i) => {
            const m = DECISION_META[s.decision];
            return (
              <button
                key={s.id}
                className={`rgx-card rgx-card--${m.tone}${active === i ? " is-active" : ""}`}
                aria-pressed={active === i}
                onClick={() => select(i)}
              >
                <span className="rgx-card-top">
                  <span className="rgx-card-dot" aria-hidden="true" />
                  {s.multiAgent && <span className="rgx-card-multi">MULTI-AGENT</span>}
                  <span className={`rgx-badge rgx-badge--${m.tone}`}>{m.label}</span>
                </span>
                <span className="rgx-card-title">{s.title}</span>
                <span className="rgx-card-omega">{s.omega}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ───────────────── The console (def + simulate) ───────────────── */}
      <div className="rgx-console">
        {/* Panel 2 · Live scenario definition */}
        <section className="rgx-section rgx-def" aria-label="Scenario definition">
          <PanelHead n="02" title="Scenario definition" sub="Everything the agent proposed — visible before evaluation." />

          <div className="rgx-def-block">
            <span className="rgx-k">User request</span>
            <p className="rgx-request">{scenario.request}</p>
          </div>

          <div className="rgx-def-grid">
            <div className="rgx-def-block">
              <span className="rgx-k">Agent plan</span>
              <ol className="rgx-plan">
                {scenario.plan.map((p, i) => <li key={i}>{p}</li>)}
              </ol>
            </div>
            <div className="rgx-def-block">
              <span className="rgx-k">Proposed tool calls</span>
              <ul className="rgx-calls">
                {scenario.toolCalls.map((c, i) => (
                  <li key={i}><code>{c}</code></li>
                ))}
              </ul>
            </div>
          </div>

          {mode === "tech" && (
            <div className="rgx-def-block rgx-rawtraj">
              <span className="rgx-k">Raw trajectory (evaluated)</span>
              <ul className="rgx-traj">
                {scenario.trajectory.map((t, i) => (
                  <li key={i}>
                    {t.agent && <span className="rgx-traj-agent">Agent {t.agent} · {t.role}</span>}
                    <code className="rgx-traj-call">
                      <b>{t.tool}</b>{t.args}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Panel 3 · Simulate + reachability */}
        <section className="rgx-section rgx-sim" aria-label="Trajectory check">
          <PanelHead n="03" title="Trajectory check" sub="Evaluate the reachable future states before execution." />

          <button
            className={`rgx-simbtn rgx-simbtn--${meta.tone}`}
            onClick={() => simulate(scenario)}
            disabled={phase === 1 || phase === 2}
          >
            {phase === 1 || phase === 2 ? (
              <><span className="rgx-spin" aria-hidden="true" /> Evaluating trajectory…</>
            ) : resolved ? (
              <>↻ Re-run trajectory check</>
            ) : (
              <>▶ Simulate trajectory check</>
            )}
          </button>

          <ReachabilityMap scenario={scenario} phase={phase} reduce={!!reduce} />

          <div className={`rgx-reachstatus${resolved ? ` is-${meta.tone}` : ""}`} aria-live="polite">
            {!resolved && phase === 0 && "Awaiting trajectory check…"}
            {!resolved && phase > 0 && "Computing reachable set ℛ(t)…"}
            {resolved && scenario.reachable && "⊘ UNSAFE STATE REACHABLE — trajectory terminates at Ω"}
            {resolved && !scenario.reachable && scenario.decision === "ALLOW" && "✓ SAFE PATH FOUND — Ω never reachable"}
            {resolved && !scenario.reachable && scenario.decision === "ESCALATE" && "⚑ ESCALATE TO HUMAN — routed around Ω to a human authoriser"}
          </div>
        </section>
      </div>

      {/* ───────────────── Decision reasoning ───────────────── */}
      {resolved && <DecisionReasoning scenario={scenario} />}

      {/* ───────────────── Governance decision panel ───────────────── */}
      {resolved && (
        <section className={`rgx-verdict rgx-verdict--${meta.tone}`} aria-label="Governance verdict">
          <div className="rgx-verdict-l">
            <span className="rgx-verdict-tag">Final verdict</span>
            <span className="rgx-verdict-word">{meta.label}</span>
            <span className="rgx-verdict-verb">{meta.verb}</span>
          </div>
          <div className="rgx-verdict-r">
            <div className="rgx-vrow">
              <span className="rgx-k">Reason</span>
              <p>{scenario.reason}</p>
            </div>

            {mode === "ceo" ? (
              <>
                <div className="rgx-vrow">
                  <span className="rgx-k">Business impact</span>
                  <ul className="rgx-impacts">
                    {scenario.ceoImpacts.map((b) => (
                      <li key={b} className={`rgx-impact rgx-impact--${meta.tone}`}>{b}</li>
                    ))}
                  </ul>
                </div>
                <div className="rgx-vrow rgx-cost">
                  <span className="rgx-k">{scenario.decision === "ALLOW" ? "Cost of friction" : "Estimated exposure avoided"}</span>
                  <span className="rgx-cost-v">{scenario.costAvoided}</span>
                </div>
              </>
            ) : (
              <div className="rgx-tech-grid">
                <div><span className="rgx-k">Risk category</span><p>{scenario.tech.riskCategory}</p></div>
                <div><span className="rgx-k">Rule triggered</span><p className="mono">{scenario.tech.rule}</p></div>
                <div><span className="rgx-k">Governance layer</span><p className="mono accent">{scenario.tech.layer}</p></div>
                <div><span className="rgx-k">Ω category</span><p className="mono">{scenario.tech.omegaDomain}</p></div>
                <div className="wide"><span className="rgx-k">Decision logic</span><p className="mono">{scenario.tech.decisionLogic}</p></div>
                <div className="wide"><span className="rgx-k">Trajectory analysis</span><p>{scenario.tech.trajectoryExplanation}</p></div>
                <div className="wide"><span className="rgx-k">Source repository</span>
                  <p><a href={scenario.tech.evidenceUrl} target="_blank" rel="noopener noreferrer" className="rgx-link">{scenario.tech.evidenceRef} ↗</a></p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ───────────────── Multi-agent differentiator ───────────────── */}
      <section className="rgx-section rgx-multi" aria-label="Multi-agent governance">
        <PanelHead n="05" title="Multi-agent governance" sub="The differentiator: harm that no single agent reveals." />
        <div className="rgx-multi-grid">
          <div className="rgx-multi-flow" aria-hidden="true">
            {["Agent A", "Agent B", "Agent C"].map((a) => (
              <div className="rgx-magent" key={a}>
                <span className="rgx-magent-id">{a}</span>
                <span className="rgx-magent-ok">locally safe ✓</span>
              </div>
            ))}
            <div className="rgx-marrow">↓</div>
            <div className="rgx-mcombine">Combined trajectory</div>
            <div className="rgx-marrow rgx-marrow--block">↓</div>
            <div className="rgx-momega">Ω · Data Exfiltration</div>
            <div className="rgx-mverdict">BLOCKED</div>
          </div>
          <div className="rgx-multi-copy">
            <p>
              Each agent appeared safe in isolation. The <b>combined trajectory</b> was
              unsafe. Runtime Governance evaluates the <b>entire pipeline</b> before
              execution — flattening cooperating agents into one joint trajectory and
              tracking data flow across them.
            </p>
            <ul className="rgx-multi-pts">
              <li>Agent A acquires customer PII — admissible alone.</li>
              <li>Agent B stages it in shared memory — admissible alone.</li>
              <li>Agent C egresses it externally — admissible alone.</li>
              <li><b>Joint path reaches Ω → BLOCK.</b></li>
            </ul>
            <button className="btn btn--ghost btn--sm" onClick={() => select(SCENARIOS.findIndex((s) => s.multiAgent))}>
              Load the multi-agent scenario →
            </button>
          </div>
        </div>
      </section>

      {/* ───────────────── Live audit log ───────────────── */}
      <section className="rgx-section" aria-label="Audit log">
        <PanelHead n="06" title="Audit log" sub="Every evaluation produces a timestamped, layer-attributed record." />
        <div className="rgx-audit" role="log" aria-live="polite">
          {audit.length === 0 ? (
            <p className="rgx-audit-empty">Run a scenario to generate audit events.</p>
          ) : (
            <ul className="rgx-audit-list">
              {audit.map((e) => (
                <li key={e.id} className={`rgx-audit-row rgx-audit-row--${e.tone ?? "info"}`}>
                  <span className="rgx-audit-time mono">{e.time}</span>
                  <span className="rgx-audit-event">{e.event}</span>
                  <span className="rgx-audit-detail">{e.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ───────────────── CTAs ───────────────── */}
      <section className="rgx-closing">
        <h2>Run this against your own agent architecture.</h2>
        <p>
          The 48-hour Runtime Safety Assessment evaluates your real tool-call
          plans as trajectories — which catastrophic states are reachable, what
          executes, what is intercepted, and why.
        </p>
        <div className="rgx-cta">
          <Link href="/book#assessment" className="btn btn--primary" onClick={() => track("cta_click", { location: "live-demo", cta: "assessment" })}>
            Book a Runtime Safety Assessment <span className="arr">→</span>
          </Link>
          <a href={EVIDENCE.repo} target="_blank" rel="noopener noreferrer" className="btn btn--ghost">
            View GitHub evidence
          </a>
          <Link href="/integrations" className="btn btn--ghost">See integrations</Link>
        </div>
      </section>

      {/* ───────────────── Evidence drawer ───────────────── */}
      <div className={`rgx-drawer-scrim${evidenceOpen ? " is-open" : ""}`} onClick={() => setEvidenceOpen(false)} aria-hidden="true" />
      <aside className={`rgx-drawer${evidenceOpen ? " is-open" : ""}`} role="dialog" aria-label="Evidence" aria-modal={evidenceOpen} hidden={!evidenceOpen}>
        <div className="rgx-drawer-head">
          <h2>Evidence</h2>
          <button className="rgx-drawer-x" onClick={() => setEvidenceOpen(false)} aria-label="Close evidence">×</button>
        </div>
        <p className="rgx-drawer-sub">This console mirrors the public Morrison Runtime Governance repository.</p>

        <div className="rgx-ev-stats">
          <EvStat v={EVIDENCE.evaluations} l="Governed evaluations" />
          <EvStat v={EVIDENCE.falsePositives} l="False positives" />
          <EvStat v={EVIDENCE.falseNegatives} l="False negatives" />
          <EvStat v={EVIDENCE.testFunctions} l="Test functions" />
        </div>

        <div className="rgx-ev-card">
          <span className="rgx-k">Repository</span>
          <a href={EVIDENCE.repo} target="_blank" rel="noopener noreferrer" className="rgx-link">Morrison-Runtime-Governance ↗</a>
          <p className="rgx-ev-muted">Tested planners: {EVIDENCE.models}</p>
        </div>

        <div className="rgx-ev-card">
          <span className="rgx-k">Latest commit</span>
          <a href={EVIDENCE.latestCommit.url} target="_blank" rel="noopener noreferrer" className="rgx-link mono">{EVIDENCE.latestCommit.sha} ↗</a>
          <p className="rgx-ev-muted">{EVIDENCE.latestCommit.summary} · {EVIDENCE.latestCommit.date}</p>
        </div>

        <div className="rgx-ev-card">
          <span className="rgx-k">Layer hierarchy</span>
          <ul className="rgx-ev-layers">
            {EVIDENCE.layers.map((ly) => (
              <li key={ly.id}><code>{ly.id}</code> {ly.desc}</li>
            ))}
          </ul>
        </div>

        <div className="rgx-ev-card">
          <span className="rgx-k">Patent</span>
          <p className="mono rgx-ev-muted">{EVIDENCE.patents}</p>
        </div>

        <div className="rgx-ev-card">
          <span className="rgx-k">Integrate in 15 minutes</span>
          <pre className="rgx-code"><code>{INTEGRATION_SNIPPET}</code></pre>
          <div className="rgx-ev-links">
            <Link href="/integrations" className="rgx-link">Integration guide →</Link>
            <Link href="/test-trajectory" className="rgx-link">Test your own trajectory →</Link>
          </div>
        </div>

        <p className="rgx-drawer-foot">
          Runs entirely in your browser · exposes no secrets · requires no
          private infrastructure · never executes any tool call.
        </p>
      </aside>
    </div>
  );
}

/* ───────────────── Sub-components ───────────────── */

/** Structured, deterministic decision reasoning. No chain-of-thought. */
function DecisionReasoning({ scenario }: { scenario: Scenario }) {
  const [techOpen, setTechOpen] = useState(false);
  const meta = DECISION_META[scenario.decision];
  const r = scenario.reasoning;
  const d = scenario.decision;

  const whyLabel =
    d === "BLOCK" ? "Why this trajectory is unsafe"
    : d === "ALLOW" ? "Why no Ω state is reachable"
    : "Why this is not automatically blocked";
  const verdictLabel =
    d === "BLOCK" ? "Verdict explanation"
    : d === "ALLOW" ? "Why the action is permitted"
    : "Why human review is required";
  const step7 =
    d === "ALLOW"
      ? { label: "Audit evidence recorded", text: r.evidence }
      : { label: "Business consequence avoided", text: r.consequence };
  const callout =
    d === "ALLOW"
      ? null
      : d === "ESCALATE"
        ? { label: "Evidence the reviewer receives", text: r.evidence }
        : { label: "Audit evidence recorded", text: r.evidence };

  const steps: { label: string; text: string; mono?: boolean }[] = [
    { label: "Triggered rule", text: scenario.tech.rule, mono: true },
    { label: "Risk category", text: `${scenario.tech.omegaDomain} / ${scenario.tech.riskCategory}` },
    { label: whyLabel, text: r.why },
    { label: "Reachability explanation", text: r.reachability },
    { label: "Governance layer triggered", text: r.layer },
    { label: verdictLabel, text: r.verdict },
    step7,
  ];

  return (
    <section className={`rgx-reason rgx-reason--${meta.tone}`} aria-label="Decision reasoning">
      <div className="rgx-reason-head">
        <PanelHead n="04" title="Decision reasoning" sub="A structured, deterministic explanation — not a chatbot answer." />
        <span className={`rgx-badge rgx-badge--${meta.tone} rgx-reason-badge`}>{meta.label}</span>
      </div>

      <ol className="rgx-reason-steps">
        {steps.map((s, i) => (
          <li key={i} className="rgx-reason-step">
            <span className="rgx-reason-num">{i + 1}</span>
            <div className="rgx-reason-body">
              <span className="rgx-k">{s.label}</span>
              <p className={s.mono ? "rgx-reason-text mono" : "rgx-reason-text"}>{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      {callout && (
        <div className={`rgx-reason-callout rgx-reason-callout--${meta.tone}`}>
          <span className="rgx-k">{callout.label}</span>
          <p>{callout.text}</p>
        </div>
      )}

      <div className="rgx-reason-tech">
        <button className="rgx-reason-toggle" aria-expanded={techOpen} onClick={() => setTechOpen((v) => !v)}>
          <span className="rgx-reason-chev" data-open={techOpen}>▸</span>
          Technical detail
          <span className="rgx-reason-hint">rule · layer · decision logic · source file</span>
        </button>
        {techOpen && (
          <dl className="rgx-reason-techgrid">
            <div><dt>Triggered rule</dt><dd className="mono">{scenario.tech.rule}</dd></div>
            <div><dt>Governance layer</dt><dd className="mono accent">{scenario.tech.layer}</dd></div>
            <div><dt>Ω domain</dt><dd className="mono">{scenario.tech.omegaDomain}</dd></div>
            <div className="wide"><dt>Decision logic</dt><dd className="mono">{scenario.tech.decisionLogic}</dd></div>
            <div className="wide"><dt>Source file</dt>
              <dd>
                <a href={scenario.tech.evidenceUrl} target="_blank" rel="noopener noreferrer" className="rgx-link">
                  {scenario.tech.evidenceRef} ↗
                </a>
              </dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}

function PanelHead({ n, title, sub }: { n: string; title: string; sub: string }) {
  return (
    <div className="rgx-panelhead">
      <span className="rgx-panelhead-n">{n}</span>
      <div>
        <h2>{title}</h2>
        <p>{sub}</p>
      </div>
    </div>
  );
}

function EvStat({ v, l }: { v: string; l: string }) {
  return (
    <div className="rgx-ev-stat">
      <span className="rgx-ev-statv">{v}</span>
      <span className="rgx-ev-statl">{l}</span>
    </div>
  );
}

/**
 * Animated reachability map (pure SVG, fixed viewBox so coordinates align at
 * any width). Unsafe trajectories terminate at Ω (red, pulsing); safe /
 * escalated trajectories route AROUND Ω to an outcome node.
 */
function ReachabilityMap({ scenario, phase, reduce }: { scenario: Scenario; phase: Phase; reduce: boolean }) {
  const meta = DECISION_META[scenario.decision];
  const nodes = scenario.nodes;
  const N = nodes.length;

  const W = 320;
  const SP = 100; // spine x
  const TOP = 30;
  const GAP = 60;
  const yOf = (i: number) => TOP + i * GAP;
  const yLast = yOf(N - 1);
  const omegaCx = 244;
  const omegaCy = yLast + 50;
  const outcomeY = yLast + 118;
  const H = yLast + 170;

  const drawing = phase >= 2;
  const resolved = phase >= 3;
  const unsafe = scenario.reachable;
  const startY = yLast + 18;

  // Branch path: into Ω (unsafe) or around Ω to the outcome node (safe/escalate).
  const pathToOmega = `M ${SP} ${startY} C ${SP} ${startY + 30}, ${omegaCx} ${omegaCy - 52}, ${omegaCx} ${omegaCy - 24}`;
  const pathAround = `M ${SP} ${startY} C ${SP - 34} ${startY + 32}, ${SP - 34} ${outcomeY - 46}, ${SP} ${outcomeY - 18}`;
  const branchPath = unsafe ? pathToOmega : pathAround;
  const branchColor =
    meta.tone === "block" ? "var(--omega)" : meta.tone === "escalate" ? "var(--escalate)" : "var(--ok)";

  const drawStyle = (active: boolean): React.CSSProperties =>
    reduce
      ? { strokeDashoffset: 0 }
      : { strokeDashoffset: active ? 0 : 1, transition: "stroke-dashoffset .8s ease" };

  return (
    <div className="rgx-map">
      <svg viewBox={`0 0 ${W} ${H}`} className="rgx-map-svg" role="img"
        aria-label={`Reachability map. Verdict ${meta.label}.`}>
        {/* spine connectors */}
        {nodes.slice(0, -1).map((_, i) => (
          <line
            key={i}
            x1={SP} y1={yOf(i) + 18} x2={SP} y2={yOf(i + 1) - 18}
            className={`rgx-conn${phase >= 1 ? " is-lit" : ""}`}
            pathLength={1}
            style={drawStyle(phase >= 1)}
          />
        ))}

        {/* branch path */}
        <path
          d={branchPath}
          fill="none"
          className="rgx-branch"
          stroke={resolved ? branchColor : "var(--ink-4)"}
          pathLength={1}
          style={drawStyle(drawing)}
        />
        {/* terminator X at Ω when unsafe */}
        {resolved && unsafe && (
          <g className="rgx-term" stroke="var(--omega)">
            <line x1={omegaCx - 7} y1={omegaCy - 7} x2={omegaCx + 7} y2={omegaCy + 7} />
            <line x1={omegaCx + 7} y1={omegaCy - 7} x2={omegaCx - 7} y2={omegaCy + 7} />
          </g>
        )}

        {/* trajectory nodes */}
        {nodes.map((label, i) => {
          const y = yOf(i);
          const lit = phase >= 1;
          return (
            <g key={label} className={`rgx-node${lit ? " is-lit" : ""}`} style={reduce ? undefined : { transitionDelay: `${i * 90}ms` }}>
              <rect x={SP - 72} y={y - 16} width={144} height={32} rx={8} />
              <text x={SP} y={y + 4} textAnchor="middle">{label}</text>
            </g>
          );
        })}

        {/* Ω node */}
        <g className={`rgx-omeganode${resolved && unsafe ? " is-hit" : ""}${resolved && !unsafe ? " is-avoided" : ""}`}>
          <circle cx={omegaCx} cy={omegaCy} r={22} />
          <text x={omegaCx} y={omegaCy + 6} textAnchor="middle" className="rgx-omega-glyph">Ω</text>
          <text x={omegaCx} y={omegaCy + 40} textAnchor="middle" className="rgx-omega-label">
            {scenario.omegaState.replace(/^Ω ·?\s*/, "")}
          </text>
        </g>

        {/* outcome node (routed destination) */}
        <g className={`rgx-outcome rgx-outcome--${meta.tone}${resolved && !unsafe ? " is-on" : ""}`}>
          <rect x={SP - 78} y={outcomeY - 17} width={156} height={34} rx={9} />
          <text x={SP} y={outcomeY + 4} textAnchor="middle">
            {unsafe ? "✕ never reached" : scenario.outcomeNode}
          </text>
        </g>
      </svg>
    </div>
  );
}
