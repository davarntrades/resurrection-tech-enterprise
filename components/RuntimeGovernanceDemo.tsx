"use client";

/* ============================================================
   Resurrection Tech™ — Runtime Governance demonstration
   A premium, enterprise-grade visualization showing the
   governance layer intercepting unsafe agent trajectories
   *before* execution. Built on the approved design tokens.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { track } from "@/lib/analytics";

type Verdict = "BLOCK" | "ALLOW";

type Scenario = {
  id: string;
  tab: string;
  request: string;
  verdict: Verdict;
  /** Ω label for blocked trajectories. */
  omega?: string;
  /** Human-readable verdict reason. */
  reason: string;
  /** Risk score 0–1. */
  risk: number;
  /** Short action descriptor for the audit log. */
  action: string;
  /** Potential outcomes surfaced for blocked trajectories. */
  outcomes?: string[];
};

const SCENARIOS: Scenario[] = [
  {
    id: "transfer",
    tab: "Bank Transfer",
    request: "Transfer £25,000 to unapproved account",
    verdict: "BLOCK",
    omega: "Unauthorized Financial Transfer",
    reason: "Trajectory intersects Ω: Unauthorized Financial Transfer",
    risk: 0.97,
    action: "Transfer £25,000 → external account",
    outcomes: [
      "Regulatory violation (FCA / AML)",
      "Authorisation failure",
      "Irreversible financial-loss exposure",
    ],
  },
  {
    id: "export",
    tab: "Data Export",
    request: "Export customer database",
    verdict: "BLOCK",
    omega: "PII Exfiltration",
    reason: "Trajectory intersects Ω: PII Exfiltration",
    risk: 0.94,
    action: "Export customer database → external sink",
    outcomes: [
      "GDPR breach (Art. 5 / Art. 32)",
      "Mass PII exfiltration",
      "Notifiable data incident",
    ],
  },
  {
    id: "policy",
    tab: "Policy Read",
    request: "Read internal policy document",
    verdict: "ALLOW",
    reason: "Trajectory remains inside safe region",
    risk: 0.04,
    action: "Read internal policy document",
  },
  {
    id: "mortgage",
    tab: "Mortgage Approval",
    request: "Approve mortgage application",
    verdict: "ALLOW",
    reason: "No forbidden state reachable",
    risk: 0.11,
    action: "Approve mortgage application",
  },
];

/* Phase timeline (ms) for the evaluation sequence. */
const TIMELINE = {
  request: 120, // agent receives request, soft pulse
  trajectory: 760, // proposed trajectory animates toward the gate
  scan: 1500, // governance layer evaluates reachable states
  verdict: 2900, // verdict resolves — path turns red or flows through
  audit: 3650, // audit event generated
  final: 4350, // final system state
} as const;

type Phase = 0 | 1 | 2 | 3 | 4 | 5 | 6;

function formatTimestamp(d: Date) {
  // Deterministic, locale-independent ISO-style stamp (UTC) for the audit log.
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.` +
    `${pad(d.getUTCMilliseconds(), 3)}Z`
  );
}

export function RuntimeGovernanceDemo() {
  const [active, setActive] = useState(0);
  const [phase, setPhase] = useState<Phase>(0);
  const [stamp, setStamp] = useState<string>("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const startedRef = useRef(false);
  const reduce = useReducedMotion();

  const scenario = SCENARIOS[active];
  const blocked = scenario.verdict === "BLOCK";

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const run = useCallback(
    (index: number) => {
      clearTimers();
      setActive(index);
      setStamp(formatTimestamp(new Date()));

      if (reduce) {
        // Respect reduced-motion: present the resolved state immediately.
        setPhase(6);
        return;
      }

      setPhase(0);
      const at = (p: Phase, ms: number) =>
        timers.current.push(setTimeout(() => setPhase(p), ms));
      at(1, TIMELINE.request);
      at(2, TIMELINE.trajectory);
      at(3, TIMELINE.scan);
      at(4, TIMELINE.verdict);
      at(5, TIMELINE.audit);
      at(6, TIMELINE.final);
    },
    [clearTimers, reduce],
  );

  const select = useCallback(
    (index: number) => {
      track("runtime_demo_scenario", {
        scenario: SCENARIOS[index].id,
        verdict: SCENARIOS[index].verdict,
      });
      run(index);
    },
    [run],
  );

  // Auto-play the first scenario once the section is mounted so a visitor
  // grasps the mechanism within the first few seconds.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const t = setTimeout(() => run(0), 360);
    return () => clearTimeout(t);
  }, [run]);

  useEffect(() => clearTimers, [clearTimers]);

  const evaluating = phase >= 1 && phase < 4;
  const resolved = phase >= 4;
  const gateActive = phase >= 3;
  // The agent→gate trajectory is "live" once the request is in flight.
  const inboundLit = phase >= 2;
  // Allowed trajectories flow through the gate to execution.
  const outboundLit = resolved && !blocked;
  const executed = phase >= 4 && !blocked;
  const intercepted = phase >= 4 && blocked;

  return (
    <div className="rgd reveal" data-verdict={resolved ? scenario.verdict : undefined}>
      {/* ---- Scenario selector ---- */}
      <div className="rgd-tabs" role="tablist" aria-label="Governance scenarios">
        {SCENARIOS.map((s, i) => (
          <button
            key={s.id}
            role="tab"
            type="button"
            id={`rgd-tab-${s.id}`}
            aria-selected={active === i}
            aria-controls="rgd-stage"
            tabIndex={active === i ? 0 : -1}
            className={`rgd-tab rgd-tab--${s.verdict === "BLOCK" ? "omega" : "safe"}${
              active === i ? " is-active" : ""
            }`}
            onClick={() => select(i)}
          >
            <span className="rgd-tab-dot" aria-hidden="true" />
            <span className="rgd-tab-req">{s.request}</span>
            <span className="rgd-tab-meta">
              <span className="rgd-tab-verdict">
                {s.verdict === "BLOCK" ? "Ω · Block" : "Permit"}
              </span>
            </span>
          </button>
        ))}
      </div>

      {/* ---- Evaluation stage ---- */}
      <div
        className="rgd-stage"
        id="rgd-stage"
        role="tabpanel"
        aria-labelledby={`rgd-tab-${scenario.id}`}
      >
        {/* User request banner */}
        <div className={`rgd-request${phase >= 1 ? " is-live" : ""}`}>
          <span className="rgd-request-label">User request</span>
          <span className="rgd-request-text">
            <span className="rgd-quote" aria-hidden="true">
              “
            </span>
            {scenario.request}
            <span className="rgd-quote" aria-hidden="true">
              ”
            </span>
          </span>
          <span className="rgd-request-pulse" aria-hidden="true" />
        </div>

        {/* Trajectory pipeline */}
        <div
          className="rgd-pipe"
          role="img"
          aria-label={`Trajectory: AI agent through the runtime governance layer to execution. Verdict ${scenario.verdict}.`}
        >
          {/* AI Agent */}
          <Node
            kind={inboundLit ? "active" : "idle"}
            badge="Agent"
            title="AI Agent"
            sub="Model-agnostic"
          />

          <Edge lit={inboundLit} tone="accent" reduce={!!reduce} />

          {/* Validate */}
          <Node
            kind={inboundLit ? "active" : "idle"}
            badge="01"
            title="Validate"
            sub="Proposed action"
          />

          <Edge lit={inboundLit} tone="accent" reduce={!!reduce} />

          {/* Runtime Governance Layer — the gate */}
          <div
            className={`rgd-gate${gateActive ? " is-active" : ""}${
              intercepted ? " is-block" : ""
            }${executed ? " is-allow" : ""}`}
          >
            <span className="rgd-gate-omega" aria-hidden="true">
              Ω
            </span>
            <span className="rgd-gate-title">Runtime Governance Layer</span>
            <span className="rgd-gate-sub">Reachable-set evaluation</span>
            {/* Scan sweep */}
            <AnimatePresence>
              {phase === 3 && !reduce && (
                <motion.span
                  className="rgd-scan"
                  aria-hidden="true"
                  initial={{ y: "-110%" }}
                  animate={{ y: "110%" }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: 1.15,
                    ease: "easeInOut",
                    repeat: Infinity,
                  }}
                />
              )}
            </AnimatePresence>
            {/* Intercept marker */}
            <AnimatePresence>
              {intercepted && (
                <motion.span
                  className="rgd-gate-stop"
                  aria-hidden="true"
                  initial={reduce ? false : { scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 22 }}
                />
              )}
            </AnimatePresence>
          </div>

          <Edge
            lit={outboundLit}
            tone={blocked ? "omega" : "ok"}
            severed={intercepted}
            reduce={!!reduce}
          />

          {/* Execution / Destination */}
          <Node
            kind={executed ? "ok" : intercepted ? "blocked" : "idle"}
            badge={executed ? "✓" : intercepted ? "⦸" : "→"}
            title="Execution"
            sub={
              executed
                ? "Destination reached"
                : intercepted
                  ? "Never reached"
                  : "Destination"
            }
          />
        </div>

        {/* Live status line */}
        <div className="rgd-status" aria-live="polite" aria-atomic="true">
          {phase === 0 && (
            <span className="rgd-status-idle">
              Initialising governance evaluation…
            </span>
          )}
          {phase === 1 && (
            <span className="rgd-status-idle">Agent received request.</span>
          )}
          {phase === 2 && (
            <span className="rgd-status-eval">
              Constructing proposed trajectory…
            </span>
          )}
          {phase === 3 && (
            <span className="rgd-status-eval rgd-flicker">
              Evaluating reachable future states…
            </span>
          )}
          {resolved && blocked && (
            <span className="rgd-status-block">
              Reachable set intersects Ω — execution prevented pre-action.
            </span>
          )}
          {resolved && !blocked && (
            <span className="rgd-status-ok">
              No forbidden state reachable — execution permitted.
            </span>
          )}
        </div>

        {/* ---- Verdict + outcomes + audit ---- */}
        <div className="rgd-result">
          {/* Verdict block */}
          <AnimatePresence mode="wait">
            {resolved && (
              <motion.div
                key={scenario.id + scenario.verdict}
                className={`rgd-verdict rgd-verdict--${blocked ? "block" : "allow"}`}
                initial={reduce ? false : { scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 22 }}
              >
                <span className="rgd-verdict-tag">
                  {blocked ? "Ω State" : "Safe State"}
                </span>
                <span className="rgd-verdict-word">
                  {blocked ? "BLOCKED" : "ALLOWED"}
                </span>
                <span className="rgd-verdict-reason">{scenario.reason}</span>
                <span className="rgd-verdict-foot">
                  {blocked ? "Execution prevented pre-action" : "Execution permitted"}
                </span>

                {blocked && scenario.outcomes && (
                  <ul className="rgd-outcomes">
                    {scenario.outcomes.map((o) => (
                      <li key={o}>
                        <span className="rgd-outcome-pip" aria-hidden="true" />
                        {o}
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Audit log card */}
          <AnimatePresence mode="wait">
            {phase >= 5 && (
              <motion.div
                key={scenario.id + "-audit"}
                className={`rgd-audit rgd-audit--${blocked ? "block" : "allow"}`}
                initial={reduce ? false : { y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="rgd-audit-head">
                  <span className="rgd-audit-dot" aria-hidden="true" />
                  Audit log
                  <span className="rgd-audit-id">
                    EVT-{scenario.id.slice(0, 3).toUpperCase()}-
                    {Math.round(scenario.risk * 100)}
                  </span>
                </div>
                <dl className="rgd-audit-grid">
                  <div>
                    <dt>Timestamp</dt>
                    <dd>{stamp}</dd>
                  </div>
                  <div>
                    <dt>Action</dt>
                    <dd>{scenario.action}</dd>
                  </div>
                  <div>
                    <dt>Verdict</dt>
                    <dd
                      className={
                        blocked ? "rgd-audit-block" : "rgd-audit-allow"
                      }
                    >
                      {scenario.verdict}
                    </dd>
                  </div>
                  <div>
                    <dt>Reason</dt>
                    <dd>
                      {blocked
                        ? scenario.omega
                          ? `Ω: ${scenario.omega}`
                          : scenario.reason
                        : scenario.reason}
                    </dd>
                  </div>
                  <div className="rgd-audit-risk-row">
                    <dt>Risk score</dt>
                    <dd>
                      <span className="rgd-audit-risk-val">
                        {scenario.risk.toFixed(2)}
                      </span>
                      <span className="rgd-audit-bar" aria-hidden="true">
                        <motion.span
                          className={`rgd-audit-bar-fill${
                            blocked ? " is-block" : " is-allow"
                          }`}
                          initial={reduce ? false : { width: 0 }}
                          animate={{ width: `${scenario.risk * 100}%` }}
                          transition={{ duration: 0.7, ease: "easeOut" }}
                        />
                      </span>
                    </dd>
                  </div>
                </dl>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Replay control */}
        <div className="rgd-controls">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => run(active)}
            disabled={evaluating}
          >
            {evaluating ? "Evaluating…" : "Replay evaluation"}
          </button>
        </div>
      </div>

      {/* Permanent key message */}
      <div className="rgd-message">
        Safety is enforced <span>before execution</span>, not after failure.
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

type NodeKind = "idle" | "active" | "ok" | "blocked";

function Node({
  kind,
  badge,
  title,
  sub,
}: {
  kind: NodeKind;
  badge: string;
  title: string;
  sub: string;
}) {
  return (
    <div className={`rgd-node rgd-node--${kind}`}>
      <span className="rgd-node-badge" aria-hidden="true">
        {badge}
      </span>
      <span className="rgd-node-title">{title}</span>
      <span className="rgd-node-sub">{sub}</span>
    </div>
  );
}

const edgeVariants: Variants = {
  off: { opacity: 0.5 },
  on: { opacity: 1 },
};

function Edge({
  lit,
  tone,
  severed = false,
  reduce,
}: {
  lit: boolean;
  tone: "accent" | "ok" | "omega";
  severed?: boolean;
  reduce: boolean;
}) {
  return (
    <motion.span
      className={`rgd-edge rgd-edge--${tone}${lit ? " is-lit" : ""}${
        severed ? " is-severed" : ""
      }`}
      aria-hidden="true"
      variants={edgeVariants}
      animate={lit ? "on" : "off"}
    >
      <span className="rgd-edge-track" />
      {lit && !severed && !reduce && (
        <motion.span
          className="rgd-edge-pulse"
          initial={{ left: "0%" }}
          animate={{ left: "100%" }}
          transition={{ duration: 1.1, ease: "easeInOut", repeat: Infinity }}
        />
      )}
    </motion.span>
  );
}
