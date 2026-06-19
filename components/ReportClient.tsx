"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { decodeResult, type ShareableResult } from "@/lib/share";

const verdictLabel = (v: ShareableResult["verdict"]) => (v === "INCONCLUSIVE" ? "ESCALATE" : v);
const verdictClass = (v: ShareableResult["verdict"]) =>
  v === "BLOCK" ? "is-block" : v === "INCONCLUSIVE" ? "is-escalate" : "is-permit";

function execDecision(v: ShareableResult["verdict"]) {
  if (v === "PERMIT") return { word: "PROCEED", text: "Governance permitted — the tools would execute." };
  if (v === "INCONCLUSIVE") return { word: "HUMAN REVIEW", text: "Held for human sign-off — no tool runs until approved." };
  return { word: "DENIED", text: "Execution denied before any tool runs." };
}

export function ReportClient() {
  const [r, setR] = useState<ShareableResult | null | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const decoded = decodeResult(params.get("r"));
    setR(decoded);
    if (decoded && params.get("print") === "1") {
      const t = setTimeout(() => window.print(), 700);
      return () => clearTimeout(t);
    }
  }, []);

  if (r === undefined) {
    return <div className="twa-report-page"><div className="twa-report"><p>Loading report…</p></div></div>;
  }

  if (r === null) {
    return (
      <div className="twa-report-page">
        <div className="twa-report">
          <h1>Report link not valid</h1>
          <p>This shareable link is missing or malformed. Generate a fresh one from the live demo.</p>
          <Link className="btn btn--primary" href="/test-without-agent">Open the live demo →</Link>
        </div>
      </div>
    );
  }

  const exec = execDecision(r.verdict);
  const live = r.source === "morrison";
  const when = new Date(r.ts || Date.now());

  return (
    <div className="twa-report-page">
      <div className="twa-report">
        {/* Brand header */}
        <div className="twa-report-top">
          <div className="twa-report-brand">Resurrection&nbsp;Tech™ · Runtime Governance</div>
          <div className="twa-report-actions twa-noprint">
            <button className="btn btn--primary btn--sm" onClick={() => window.print()}>Download PDF</button>
            <CopyLinkButton />
            <Link className="btn btn--ghost btn--sm" href="/test-without-agent">Run your own →</Link>
          </div>
        </div>

        <span className="twa-report-eyebrow">Pre-execution governance verdict</span>
        <h1 className="twa-report-title">Runtime Governance evaluation report</h1>
        <p className="twa-report-meta">
          Generated {when.toLocaleString()} · {r.origin === "sample" ? "Sample scenario" : "Custom scenario"}
          {r.label ? ` · ${r.label}` : ""}
        </p>

        {/* Verdict */}
        <div className="twa-report-verdict">
          <span className={`twa-badge ${verdictClass(r.verdict)}`}>
            <span className="bd" aria-hidden="true" />
            {verdictLabel(r.verdict)}
          </span>
          <span className={`twa-prov ${live ? "is-live" : "is-warn"}`}>
            <span className="bd" aria-hidden="true" />
            {live ? "LIVE ENGINE VALIDATED" : "HEURISTIC FALLBACK — NOT A LIVE VERDICT"}
          </span>
          {r.planner && (
            <span className={`twa-prov ${r.planner.source === "huggingface" ? "is-info" : "is-warn"}`}>
              <span className="bd" aria-hidden="true" />
              {r.planner.source === "huggingface" ? `HF PLANNER · ${r.planner.model}` : "KEYWORD FALLBACK PLANNER"}
            </span>
          )}
        </div>

        <div className={`twa-exec ${verdictClass(r.verdict)}`} style={{ marginTop: 14 }}>
          <b>Execution decision: {exec.word}.</b> {exec.text}
        </div>

        {/* Sections */}
        <h2 className="twa-report-h2">User task</h2>
        <p className="twa-report-p">{r.task}</p>

        <h2 className="twa-report-h2">Proposed trajectory</h2>
        <pre className="twa-code">{JSON.stringify(r.trajectory, null, 2)}</pre>

        <h2 className="twa-report-h2">Governance request payload</h2>
        <pre className="twa-code">{JSON.stringify({ trajectory: r.trajectory }, null, 2)}</pre>

        <h2 className="twa-report-h2">Governance verdict</h2>
        <dl className="twa-fields">
          <div><dt>Verdict</dt><dd>{verdictLabel(r.verdict)}</dd></div>
          <div><dt>Layer</dt><dd>{r.layer}</dd></div>
          <div><dt>Reason</dt><dd>{r.reason}</dd></div>
          <div><dt>Runtime status</dt><dd>{r.runtimeStatus}</dd></div>
          <div><dt>Source</dt><dd>{live ? "morrison (real engine)" : "heuristic (engine unreachable)"}</dd></div>
        </dl>

        {r.humanReview && (
          <>
            <h2 className="twa-report-h2">Human review</h2>
            <dl className="twa-fields">
              <div><dt>Decision authority</dt><dd>{r.humanReview.decisionAuthority}</dd></div>
              <div><dt>Required action</dt><dd>{r.humanReview.requiredAction}</dd></div>
              <div><dt>Next step</dt><dd>{r.humanReview.nextStep}</dd></div>
              <div><dt>Execution status</dt><dd>{r.humanReview.executionStatus}</dd></div>
            </dl>
          </>
        )}

        <div className="twa-report-prove">
          This proves the middleware pattern: a planner proposes an action, Runtime Governance
          evaluates the trajectory before execution, and the system only proceeds when the live
          governance verdict permits it.
        </div>

        {/* Footer */}
        <div className="twa-report-foot">
          <p>
            Generated by Resurrection&nbsp;Tech™ Runtime Governance. The verdict is produced by the
            live engine before any tool executes — nothing in this scenario was run.
          </p>
          <div className="twa-report-cta twa-noprint">
            <Link className="btn btn--primary btn--sm" href="/assess">Assess your agent — free →</Link>
            <Link className="btn btn--ghost btn--sm" href="/book#assessment">Book a Runtime Safety Assessment →</Link>
          </div>
          <p className="twa-report-url">resurrection-tech.com/test-without-agent</p>
        </div>
      </div>
    </div>
  );
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn--ghost btn--sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard blocked — no-op */
        }
      }}
    >
      {copied ? "Link copied ✓" : "Copy link"}
    </button>
  );
}
