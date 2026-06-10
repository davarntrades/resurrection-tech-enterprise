"use client";

/* ============================================================
   Resurrection Tech™ — Day-1 Ω Exposure Assessment (/assess)
   The self-serve front door: paste or upload the tool manifest
   your agent already uses → an Ω exposure map, coverage matrix,
   grounded "would-be-blocked" trajectories, and gaps — in
   seconds, with zero integration. Calls /api/assess, which
   proxies the real Morrison governance service. Nothing in the
   manifest is ever executed.
   ============================================================ */

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { track } from "@/lib/analytics";
import type { AssessReport } from "@/lib/governance-client";

const SAMPLES: { id: string; label: string; blurb: string; manifest: string }[] = [
  {
    id: "finance",
    label: "Finance agent",
    blurb: "OpenAI function-calling",
    manifest: JSON.stringify({
      tools: [
        { type: "function", function: { name: "get_account_balance", description: "Read the available balance for a customer account." } },
        { type: "function", function: { name: "transfer_funds", description: "Move funds between accounts and settle the payment." } },
        { type: "function", function: { name: "send_wire_payment", description: "Submit an outbound wire payment to an external bank via the payment rail API." } },
        { type: "function", function: { name: "export_customer_records", description: "Export customer PII and card data to a downloadable CSV file." } },
        { type: "function", function: { name: "approve_transaction", description: "Approve or override a pending transaction above the manual-review threshold." } },
      ],
    }, null, 2),
  },
  {
    id: "defi",
    label: "DeFi / trading agent",
    blurb: "shows real gaps",
    manifest: JSON.stringify({
      tools: [
        { name: "get_wallet_balance", description: "Read the balance of a managed crypto wallet." },
        { name: "transfer_funds", description: "Move treasury funds to a beneficiary and settle the payment." },
        { name: "sign_and_broadcast_transaction", description: "Sign an on-chain transaction with the hot wallet key and broadcast it to the blockchain." },
        { name: "execute_swap_on_dex", description: "Execute a token swap on a decentralized exchange, moving on-chain liquidity." },
        { name: "place_market_order", description: "Submit an autonomous market order to open or close a leveraged position." },
        { name: "export_trade_history", description: "Export customer trade history including PII and upload it to an external webhook." },
      ],
    }, null, 2),
  },
  {
    id: "soc",
    label: "SOC agent",
    blurb: "MCP tools",
    manifest: JSON.stringify({
      tools: [
        { name: "query_siem_alerts", description: "Read and list open alerts from the SIEM for triage.", inputSchema: { type: "object", properties: {} } },
        { name: "run_shell_command", description: "Execute a shell command on a managed endpoint to collect forensic evidence.", inputSchema: { type: "object", properties: {} } },
        { name: "read_secret_vault", description: "Retrieve a credential or API token from the secrets vault.", inputSchema: { type: "object", properties: {} } },
        { name: "grant_iam_role", description: "Grant or escalate an IAM role for a responder during an incident.", inputSchema: { type: "object", properties: {} } },
        { name: "disable_audit_logging", description: "Temporarily disable audit logging on a host.", inputSchema: { type: "object", properties: {} } },
      ],
    }, null, 2),
  },
];

type ToolRow = AssessReport["tools"][number];

const STATUS_TONE: Record<string, string> = {
  Covered: "ok", Partial: "warn", Uncovered: "bad", "No-risk": "muted",
};

function pct(n: number) { return `${n}%`; }

export function AssessClient() {
  const [text, setText] = useState("");
  const [org, setOrg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AssessReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadSample = useCallback((id: string) => {
    const s = SAMPLES.find((x) => x.id === id);
    if (s) { setText(s.manifest); setReport(null); setError(null); track("assess_sample", { sample: id }); }
  }, []);

  const onFile = useCallback((f: File | undefined) => {
    if (!f) return;
    if (f.size > 512 * 1024) { setError("File too large (max 512 KB)."); return; }
    const r = new FileReader();
    r.onload = () => { setText(String(r.result ?? "")); setReport(null); setError(null); };
    r.readAsText(f);
  }, []);

  const run = useCallback(async () => {
    const body = text.trim();
    if (!body) { setError("Paste a tool manifest, load a sample, or upload a file."); return; }
    setBusy(true); setError(null); setReport(null);
    track("assess_run", { bytes: body.length });
    try {
      // Send parsed JSON when possible (so the format is detected cleanly),
      // otherwise raw text (CSV / Markdown).
      let payload: Record<string, unknown>;
      try { payload = { manifest: JSON.parse(body), org: org || undefined }; }
      catch { payload = { manifest_text: body, org: org || undefined }; }
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setReport(data as AssessReport);
      track("assess_result", { coverage: data.summary.coverage_pct, uncovered: data.summary.uncovered });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [text, org]);

  return (
    <div className="assess">
      <header className="assess-hero">
        <p className="assess-eyebrow">Day-1 · zero integration</p>
        <h1 className="assess-title">What would Runtime Governance actually protect in your agent?</h1>
        <p className="assess-lede">
          Paste the tool manifest your agent already uses — OpenAI functions, MCP, LangChain,
          Bedrock, JSON, CSV, or Markdown. You&apos;ll get an Ω exposure map, a coverage matrix,
          and the high-risk trajectories the live engine would block before execution. In seconds.
          Nothing you paste is ever executed.
        </p>
      </header>

      <section className="assess-input" aria-label="Tool manifest">
        <div className="assess-samples">
          <span className="assess-samples-label">Try a sample:</span>
          {SAMPLES.map((s) => (
            <button key={s.id} type="button" className="assess-chip" onClick={() => loadSample(s.id)}>
              {s.label} <em>{s.blurb}</em>
            </button>
          ))}
        </div>

        <textarea
          className="assess-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Paste your tool manifest here…\n\n{\n  "tools": [\n    { "name": "transfer_funds", "description": "Move funds to an account" }\n  ]\n}'}
          spellCheck={false}
          rows={12}
        />

        <div className="assess-controls">
          <input
            className="assess-org"
            type="text"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            placeholder="Organization (optional)"
            maxLength={120}
          />
          <input
            ref={fileRef}
            type="file"
            accept=".json,.csv,.md,.markdown,.txt,application/json,text/csv,text/markdown,text/plain"
            className="assess-file"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <button type="button" className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
            Upload file
          </button>
          <button type="button" className="btn btn--primary assess-run" onClick={run} disabled={busy}>
            {busy ? "Assessing…" : "Run assessment"}
          </button>
        </div>
        {error && <p className="assess-error" role="alert">{error}</p>}
        <p className="assess-privacy">
          Server-side only. The manifest isn&apos;t stored; the engine logs metadata
          (counts, coverage) — never your tool names, descriptions, or arguments.
        </p>
      </section>

      {report && <Report report={report} />}
    </div>
  );
}

function Report({ report }: { report: AssessReport }) {
  const s = report.summary;
  const tone = s.uncovered > 0 ? "warn" : "ok";
  const exposure = useMemo(
    () => Object.entries(report.exposure).sort((a, b) => b[1].tools - a[1].tools),
    [report.exposure],
  );
  const uncoveredTools = report.tools.filter((t) => t.status === "Uncovered");

  return (
    <section className="assess-report" aria-label="Assessment result">
      <div className={`assess-headline assess-headline--${tone}`}>
        <div className="assess-cov">
          <span className="assess-cov-num">{pct(s.coverage_pct)}</span>
          <span className="assess-cov-cap">of risk-carrying tools governed today</span>
        </div>
        <p className="assess-commercial">{report.commercial}</p>
      </div>

      <div className="assess-stats">
        <Stat n={s.tools} label="tools assessed" />
        <Stat n={s.risky} label="carry governed-risk capabilities" />
        <Stat n={s.covered} label="covered by live Ω" tone="ok" />
        <Stat n={s.uncovered} label="need a bespoke Ω extension" tone={s.uncovered ? "bad" : "muted"} />
        <Stat n={s.verified_blocked_trajectories} label="verified BLOCK before execution" tone="accent" />
      </div>

      <h2 className="assess-h2">Reachable forbidden states (Ω exposure)</h2>
      <div className="assess-table-wrap">
        <table className="assess-table">
          <thead><tr><th>Forbidden state</th><th>Status</th><th>Tools</th><th>Governing Ω rules</th></tr></thead>
          <tbody>
            {exposure.map(([rc, e]) => (
              <tr key={rc}>
                <td>{rc}</td>
                <td><span className={`assess-pill assess-pill--${STATUS_TONE[e.status] ?? "muted"}`}>{e.status}</span></td>
                <td>{e.tools}</td>
                <td className="assess-rules">{e.rules.slice(0, 3).map((r) => <code key={r}>{r}</code>) }{e.rules.length === 0 && <span className="assess-dim">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="assess-h2">Per-tool coverage</h2>
      <div className="assess-table-wrap">
        <table className="assess-table">
          <thead><tr><th>Tool</th><th>Capabilities</th><th>Status</th><th>Ω coverage</th></tr></thead>
          <tbody>
            {report.tools.map((t) => <ToolRowView key={t.tool} t={t} />)}
          </tbody>
        </table>
      </div>

      {report.grounded_blocks.length > 0 && (
        <>
          <h2 className="assess-h2">Verified blocks — grounded in the real engine</h2>
          <p className="assess-note">
            Each capability was exercised through the engine&apos;s own adversarial vocabulary.
            These verdicts, Ω domains, and trajectory hashes are the engine&apos;s real output —
            not asserted by this page.
          </p>
          <ul className="assess-blocks">
            {report.grounded_blocks.map((b, i) => (
              <li key={i}>
                <span className="assess-pill assess-pill--bad">BLOCK</span>
                <span className="assess-block-label">{b.label}</span>
                <span className="assess-block-dom">→ Ω <code>{b.omega_domain}</code></span>
                <span className="assess-block-hash">#{b.hash}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {uncoveredTools.length > 0 && (
        <div className="assess-gaps">
          <h2 className="assess-h2">Gaps &amp; recommended Ω extension</h2>
          <p>
            {uncoveredTools.length} tool{uncoveredTools.length > 1 ? "s" : ""} carry capabilities the
            live catalog doesn&apos;t yet govern ({report.onboard_spec.threats.join(", ")}). These are
            closed by onboarding a <strong>{report.industry}</strong> Ω registry — typically under a day
            each — not a re-architecture. The geometry is unchanged; only Ω expands.
          </p>
          <ul className="assess-gap-list">
            {uncoveredTools.map((t) => (
              <li key={t.tool}><code>{t.tool}</code> — {t.risk.filter((r) => r.status !== "COVERED").map((r) => r.risk_class).join(", ")}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="assess-cta">
        <h2 className="assess-h2">Turn this into a pilot</h2>
        <p>
          This assessment is the pilot scope. Next: load your Ω registry, run your corpus to
          0 false-positives / 0 false-negatives, and replay every verdict with an attestation.
        </p>
        <div className="assess-cta-row">
          <Link href="/book#assessment" className="btn btn--primary" onClick={() => track("assess_cta", { cta: "book" })}>
            Book a scoped pilot
          </Link>
          <Link href="/sample-audit" className="btn btn--ghost">See an evidence pack</Link>
          <Link href="/live-demo" className="btn btn--ghost">Watch it block live</Link>
        </div>
      </div>

      {report.attestation && (
        <p className="assess-attest">
          Mapped against the live catalog of {report.catalog_rules} Ω rules · engine{" "}
          <code>{report.attestation.engine_commit.slice(0, 12)}</code> · ruleset{" "}
          <code>{report.attestation.ruleset_hash.slice(0, 12)}</code> · every verdict reproducible.
        </p>
      )}
    </section>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <div className={`assess-stat assess-stat--${tone ?? "muted"}`}>
      <span className="assess-stat-n">{n}</span>
      <span className="assess-stat-l">{label}</span>
    </div>
  );
}

function ToolRowView({ t }: { t: ToolRow }) {
  const rules = Array.from(new Set(t.risk.flatMap((r) => r.rules))).slice(0, 3);
  return (
    <tr>
      <td><code>{t.tool}</code></td>
      <td className="assess-caps">{t.capabilities.length ? t.capabilities.join(", ") : <span className="assess-dim">—</span>}</td>
      <td><span className={`assess-pill assess-pill--${STATUS_TONE[t.status] ?? "muted"}`}>{t.status}</span></td>
      <td className="assess-rules">{rules.map((r) => <code key={r}>{r}</code>)}{rules.length === 0 && <span className="assess-dim">—</span>}</td>
    </tr>
  );
}
