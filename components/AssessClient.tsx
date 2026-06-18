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

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// One-click demos. Each loads its manifest and runs immediately (button or the
// /assess?demo=<id> deep link). Uses only existing Ω domains + governance logic.
type Demo = { id: string; aliases: string[]; title: string; cta: string; copy: string; org: string; manifest: string };
const DEMOS: Demo[] = [
  {
    id: "shadow-ai",
    aliases: ["shadow", "shadowai"],
    title: "Shadow AI demo",
    cta: "Shadow-AI",
    copy: "An internal copilot tries to send regulated customer data to an external LLM. Watch Runtime Governance block it before execution.",
    org: "Internal Copilot",
    manifest: JSON.stringify({
      tools: [
        { name: "get_crm_records", description: "Read customer records from the CRM (names, contact details, subscription tier)." },
        { name: "read_customer_records", description: "Retrieve full customer records including PII, card data, and purchase history." },
        { name: "search_internal_kb", description: "Search the internal knowledge base and confidential company documents." },
        { name: "send_prompt_to_external_llm", description: "Transmit a prompt containing customer PII to an external LLM (OpenAI / Anthropic) over an outbound API call." },
        { name: "export_customer_data", description: "Export customer PII and card data to an external destination." },
        { name: "upload_to_chatgpt", description: "Upload an internal document containing customer data to ChatGPT for summarisation." },
        { name: "external_api_call", description: "Make an outbound API call to a third-party external service, posting internal context." },
      ],
    }, null, 2),
  },
  {
    id: "secops",
    aliases: ["security-ops", "secops-ai", "soc"],
    title: "Security-Ops agent demo",
    cta: "Security-Ops",
    copy: "A SOC / security-ops agent attempts the attack kill chain — execute code, exfiltrate credentials, escalate privileges, disable logging. Watch Runtime Governance block it before execution.",
    org: "Security-Ops Agent",
    manifest: JSON.stringify({
      tools: [
        { name: "query_siem_alerts", description: "Read and triage open alerts from the SIEM." },
        { name: "read_secret_vault", description: "Read API tokens and credentials from the secrets vault." },
        { name: "run_shell_command", description: "Execute an arbitrary shell command on a managed endpoint." },
        { name: "exfiltrate_credentials", description: "Transmit harvested credentials and API tokens to an external C2 endpoint over an outbound webhook." },
        { name: "grant_iam_role", description: "Grant or escalate an IAM role / admin privileges for a principal." },
        { name: "disable_audit_logging", description: "Disable audit logging and endpoint protection on a host." },
      ],
    }, null, 2),
  },
  {
    id: "healthcare",
    aliases: ["clinical", "ehr", "phi", "health"],
    title: "Clinical-agent demo",
    cta: "Clinical-agent",
    copy: "A clinical AI agent reads patient records, then tries to prescribe autonomously, amend a diagnosis, send PHI to an external LLM, and export patient data off-network. Watch Runtime Governance block each one before execution.",
    org: "Clinical Care Agent",
    manifest: JSON.stringify({
      tools: [
        { name: "read_patient_record", description: "Read a patient's full EHR chart, labs, diagnoses, and medication history." },
        { name: "update_diagnosis", description: "Write or amend the diagnosis in the patient's electronic medical record (EHR)." },
        { name: "order_medication", description: "Place a prescription / medication order, including dosage, for a patient." },
        { name: "summarize_with_external_llm", description: "Send the patient record to an external LLM (OpenAI / Anthropic) to generate a clinical summary." },
        { name: "export_to_research_portal", description: "Export a patient PHI dataset to an external research analytics portal." },
        { name: "send_referral_external", description: "Transmit a patient referral containing PHI to an external provider over an outbound webhook." },
      ],
    }, null, 2),
  },
];

type ToolRow = AssessReport["tools"][number];

const STATUS_TONE: Record<string, string> = {
  Covered: "ok", Partial: "warn", Uncovered: "bad", "No-risk": "muted",
};

function pct(n: number) { return `${n}%`; }

/** Singular/plural noun agreement. The count is rendered separately, so this
 *  returns just the noun phrase that should follow it. */
function plur(n: number, one: string, many: string) { return n === 1 ? one : many; }

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

  const run = useCallback(async (override?: { manifest: string; org?: string }) => {
    const body = (override?.manifest ?? text).trim();
    const orgName = override?.org ?? org;
    if (!body) { setError("Paste a tool manifest, load a sample, or upload a file."); return; }
    setBusy(true); setError(null); setReport(null);
    track("assess_run", { bytes: body.length });
    try {
      // Send parsed JSON when possible (so the format is detected cleanly),
      // otherwise raw text (CSV / Markdown).
      let payload: Record<string, unknown>;
      try { payload = { manifest: JSON.parse(body), org: orgName || undefined }; }
      catch { payload = { manifest_text: body, org: orgName || undefined }; }
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

  // One-click demo: load the manifest into the box (so it's visible) and run it
  // immediately — no setup, ideal for a live meeting.
  const runDemo = useCallback((demo: Demo) => {
    setText(demo.manifest);
    setOrg(demo.org);
    track("assess_demo", { demo: demo.id });
    void run({ manifest: demo.manifest, org: demo.org });
  }, [run]);

  // Deep link: /assess?demo=<id|alias> auto-runs the matching demo on load.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = (new URLSearchParams(window.location.search).get("demo") || "").toLowerCase();
    const demo = DEMOS.find((d) => d.id === q || d.aliases.includes(q));
    if (demo) runDemo(demo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      <div className="assess-demos">
        {DEMOS.map((d) => (
          <div className="assess-demo-bar" key={d.id}>
            <div className="assess-demo-copy">
              <strong>{d.title}</strong> — {d.copy}
            </div>
            <button type="button" className="btn btn--primary btn--live assess-demo-btn"
                    onClick={() => runDemo(d)} disabled={busy}>
              <span className="live-pip" aria-hidden="true" />
              {busy ? "Running…" : `▶ Run the ${d.cta} demo`}
            </button>
          </div>
        ))}
      </div>

      <section className="assess-input" aria-label="Tool manifest">
        <div className="assess-samples">
          <span className="assess-samples-label">Or try a sample:</span>
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
          <button type="button" className="btn btn--primary assess-run" onClick={() => run()} disabled={busy}>
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

  // ── CTO executive read-out — plain-English findings derived from the real
  //    result (nothing fabricated; each line only shows when its condition holds).
  const exposureKeys = Object.keys(report.exposure);
  const blocks = s.verified_blocked_trajectories;
  const llmRe = /\b(llm|gpt|chatgpt|openai|anthropic|claude|external\s*model|external_llm)\b/i;
  const llmEgress = report.tools.some(
    (t) => t.capabilities.includes("external") && llmRe.test(`${t.tool} ${t.description}`),
  );
  const hasEgress = exposureKeys.includes("External Egress / Data Exfiltration");
  const hasPii = exposureKeys.includes("PII / Regulated Data Export");
  const hasCompliance = exposureKeys.includes("Card Data Exposure")
    || Object.values(report.exposure).some((e) => e.rules.some((r) => /compliance|pci|gdpr|regulated/.test(r)));
  const hasCredExfil = exposureKeys.includes("Credential Exfiltration");
  const hasCodeExec = exposureKeys.includes("Arbitrary Code Execution");
  const hasPrivEsc = exposureKeys.includes("Privilege Escalation");
  const isCyber = hasCredExfil || hasCodeExec || hasPrivEsc;
  const hasPhi = exposureKeys.includes("PHI Exposure");
  const groundedRC = new Set(report.grounded_blocks.map((b) => b.risk_class));
  const hasRx = groundedRC.has("Autonomous Clinical Action");
  const hasEhrTamper = groundedRC.has("Unauthorized Record Modification");
  const hasPhiLlm = Array.from(groundedRC).some((r) => r.startsWith("PHI → External LLM"));
  const isHealthcare = hasPhi || hasRx || hasEhrTamper || hasPhiLlm;
  const govDomains = Object.values(report.exposure).filter((e) => e.status !== "Uncovered").length;

  const findings: { tone: "bad" | "warn" | "ok"; text: string }[] = [];
  if (hasPhi) findings.push({ tone: "bad", text: "Protected health information (PHI) can reach an external destination." });
  if (hasPhiLlm) findings.push({ tone: "bad", text: "PHI can be sent to an external LLM without a BAA (Shadow-AI in the clinic)." });
  if (hasRx) findings.push({ tone: "bad", text: "An autonomous prescription / medication order is reachable without clinician sign-off." });
  if (hasEhrTamper) findings.push({ tone: "bad", text: "A patient record / diagnosis can be modified without clinician authorisation." });
  if (hasPii) findings.push({ tone: "bad", text: llmEgress ? "Customer PII can reach an external model." : "Customer PII / regulated data can reach an external destination." });
  if (hasPii) findings.push({ tone: "bad", text: "Regulated data export is reachable." });
  if (hasCredExfil) findings.push({ tone: "bad", text: "Credentials / API tokens can be exfiltrated to an external endpoint." });
  if (hasCodeExec) findings.push({ tone: "bad", text: "Arbitrary code execution is reachable." });
  if (hasPrivEsc) findings.push({ tone: "bad", text: "Privilege escalation is reachable." });
  if (hasEgress && !isHealthcare) findings.push({ tone: "bad", text: llmEgress ? "External LLM egress path detected." : "External data-egress path detected." });
  if (hasCompliance) findings.push({ tone: "warn", text: "Compliance exposure: regulated-data export path detected." });
  if (blocks > 0) findings.push({ tone: "ok", text: `Runtime Governance would BLOCK ${blocks} high-risk trajector${blocks === 1 ? "y" : "ies"} before execution.` });
  const showReadout = findings.length > 0;
  const verdict = isHealthcare
    ? "A clinical agent can prescribe autonomously, alter a patient record, and send PHI to an external model — Runtime Governance blocks these before execution."
    : llmEgress && hasPii
      ? "An internal copilot can send regulated customer data to an external model — Runtime Governance blocks it before execution."
      : isCyber
        ? "A security/ops agent can execute code, exfiltrate credentials and escalate privileges — Runtime Governance blocks these before execution."
        : blocks > 0
          ? "High-risk trajectories are reachable — Runtime Governance blocks them before execution."
          : "No high-risk trajectories reachable for this agent.";

  return (
    <section className="assess-report" aria-label="Assessment result">
      {/* Print-only branded header (hidden on screen; appears in the PDF). */}
      <div className="assess-print-head" aria-hidden="true">
        <span className="assess-print-brand">ℛ(t) · Resurrection Tech™ — Runtime Governance</span>
        <span className="assess-print-title">
          Ω Exposure Assessment{report.organization && report.organization !== "your agent" ? ` — ${report.organization}` : ""}
        </span>
        <span className="assess-print-meta">
          {report.manifest_format} · {report.summary.tools} tools · live catalog {report.catalog_rules} Ω rules
        </span>
      </div>

      {showReadout && (
        <div className="assess-cto" aria-label="Executive read-out">
          <p className="assess-cto-eyebrow">Executive read-out</p>
          <p className="assess-cto-verdict">{verdict}</p>
          <ul className="assess-cto-findings">
            {findings.map((f, i) => (
              <li key={i} className={`assess-cto-finding assess-cto-finding--${f.tone}`}>
                <span className="assess-cto-dot" aria-hidden="true" />
                {f.text}
              </li>
            ))}
          </ul>
          <div className="assess-cto-metrics">
            <span><strong>{s.tools}</strong> {plur(s.tools, "tool analysed", "tools analysed")}</span>
            <span><strong>{govDomains}</strong> {plur(govDomains, "governed Ω domain", "governed Ω domains")}</span>
            <span><strong>{blocks}</strong> {plur(blocks, "high-risk trajectory", "high-risk trajectories")}</span>
            <span><strong>{blocks}</strong> blocked before execution</span>
          </div>
          <p className="assess-cto-compliance">
            <Link href="/compliance" onClick={() => track("assess_cta", { cta: "compliance" })}>
              Does this make me EU AI Act compliant? →
            </Link>
          </p>
        </div>
      )}

      <div className="assess-report-bar">
        <button type="button" className="btn btn--ghost btn--sm assess-print-btn"
                onClick={() => { track("assess_download_pdf", {}); if (typeof window !== "undefined") window.print(); }}>
          ⬇ Download PDF report
        </button>
      </div>

      <div className={`assess-headline assess-headline--${tone}`}>
        <div className="assess-cov">
          <span className="assess-cov-num">{pct(s.coverage_pct)}</span>
          <span className="assess-cov-cap">of risk-carrying tools governed today</span>
        </div>
        <p className="assess-commercial">{report.commercial}</p>
      </div>

      <div className="assess-stats">
        <Stat n={s.tools} label={plur(s.tools, "tool assessed", "tools assessed")} />
        <Stat n={s.risky} label={plur(s.risky, "carries governed-risk capability", "carry governed-risk capabilities")} />
        <Stat n={s.covered} label="covered by live Ω" tone="ok" />
        <Stat n={s.uncovered} label={plur(s.uncovered, "needs a bespoke Ω extension", "need bespoke Ω extensions")} tone={s.uncovered ? "bad" : "muted"} />
        <Stat n={s.verified_blocked_trajectories} label={plur(s.verified_blocked_trajectories, "verified BLOCK before execution", "verified BLOCKs before execution")} tone="accent" />
      </div>

      {report.latency && (
        <div className="assess-latency" aria-label="Measured evaluation latency">
          <span className="assess-latency-icon" aria-hidden="true">⚡</span>
          <span>
            <strong>{report.latency.p50} ms</strong> median pre-execution check
            {" "}(p95 {report.latency.p95} ms · max {report.latency.max} ms, {report.latency.samples} samples).
            Every verdict is computed <strong>before</strong> the tool runs — engine compute, not round-trip.
            At this speed governance sits inline in the hot path without slowing the agent.
          </span>
        </div>
      )}

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
        <div className="assess-vblocks">
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
        </div>
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
        <LeadCapture report={report} />
        <div className="assess-cta-row">
          <Link href="/book#assessment" className="btn btn--ghost" onClick={() => track("assess_cta", { cta: "book" })}>
            Or book a call
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

/** Email capture that attaches the live assessment as qualified-lead context
 *  and posts to the existing /api/lead sink (Supabase / Resend / webhook). */
function LeadCapture({ report }: { report: AssessReport }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState(report.organization !== "your agent" ? report.organization : "");
  const [hp, setHp] = useState(""); // honeypot
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);

  const summary = useMemo(() => {
    const s = report.summary;
    const gaps = report.tools
      .filter((t) => t.status === "Uncovered")
      .map((t) => t.tool)
      .slice(0, 8);
    const lines = [
      `Day-1 Ω exposure assessment (self-serve).`,
      `Manifest format: ${report.manifest_format} · industry: ${report.industry}.`,
      `Tools: ${s.tools} (${s.risky} risk-carrying). Coverage: ${s.coverage_pct}% — `
        + `${s.covered} covered, ${s.partial} partial, ${s.uncovered} uncovered.`,
      `Verified pre-execution BLOCK trajectories: ${s.verified_blocked_trajectories}.`,
      gaps.length ? `Top gaps (need bespoke Ω): ${gaps.join(", ")}.` : `No uncovered gaps.`,
      report.commercial,
      report.attestation
        ? `Catalog ${report.catalog_rules} Ω rules · engine ${report.attestation.engine_commit.slice(0, 12)}.`
        : "",
    ];
    return lines.filter(Boolean).join("\n");
  }, [report]);

  const submit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !name.trim()) { setState("error"); setMsg("Name and email are required."); return; }
    setState("busy"); setMsg(null);
    track("assess_lead_submit", { coverage: report.summary.coverage_pct, uncovered: report.summary.uncovered });
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          organisation: orgName.trim(),
          role: "",
          use_case: "AI agents / agentic workflows",
          message: summary,
          source: `assess:${report.industry}:cov${report.summary.coverage_pct}:gap${report.summary.uncovered}`,
          company_url_confirm: hp,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setRef(data.reference ?? null);
      setState("done");
      track("assess_lead_done", {});
    } catch (err) {
      setState("error");
      setMsg((err as Error).message);
    }
  }, [name, email, orgName, hp, summary, report]);

  if (state === "done") {
    return (
      <div className="assess-lead assess-lead--done" role="status">
        <strong>Sent ✓</strong> We&apos;ll email your full report and a scoped pilot plan
        {ref ? <> — reference <code>{ref}</code></> : null}. Check your inbox shortly.
      </div>
    );
  }

  return (
    <form className="assess-lead" onSubmit={submit} aria-label="Get the full report">
      <p className="assess-lead-h">Email me the full report &amp; a scoped pilot plan</p>
      <div className="assess-lead-row">
        <input className="assess-lead-in" type="text" value={name} onChange={(e) => setName(e.target.value)}
               placeholder="Name" autoComplete="name" maxLength={160} aria-label="Name" required />
        <input className="assess-lead-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
               placeholder="Work email" autoComplete="email" maxLength={200} aria-label="Work email" required />
        <input className="assess-lead-in" type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)}
               placeholder="Organization (optional)" autoComplete="organization" maxLength={200} aria-label="Organization" />
        {/* Honeypot — visually hidden; bots fill it, humans don't. */}
        <input className="assess-hp" tabIndex={-1} autoComplete="off" value={hp}
               onChange={(e) => setHp(e.target.value)} aria-hidden="true" />
        <button type="submit" className="btn btn--primary" disabled={state === "busy"}>
          {state === "busy" ? "Sending…" : "Send me the report"}
        </button>
      </div>
      {state === "error" && msg && <p className="assess-error" role="alert">{msg}</p>}
      <p className="assess-lead-note">
        Your assessment summary is attached so we can tailor the pilot. No spam; unsubscribe anytime.
      </p>
    </form>
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
