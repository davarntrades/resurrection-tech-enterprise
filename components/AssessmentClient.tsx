"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { track, Events } from "@/lib/analytics";
import {
  INDUSTRIES, COMPANY_SIZES, STAGES, TOOL_ACCESS, CONTROLS, COMPLIANCE,
  SUCCESS_CRITERIA, NUM_AGENTS, ENGAGEMENT_INTENTS, PARTNER_TYPES, CUSTOMER_REACH, PARTNER_INTENTS,
  type AssessmentData, type Recommendation, type YesNo,
} from "@/lib/assessment";
import { slugifyRef, humanizeRef, DIRECT_SOURCE } from "@/lib/referral";

const STORAGE_KEY = "rt-assessment-v1";

const EMPTY: AssessmentData = {
  fullName: "", jobTitle: "", companyName: "", email: "", phone: "",
  industry: "", companySize: "", country: "",
  intent: "", partnerType: "", customerReach: "", customerBase: "",
  stage: "", agentsDeployed: "", customerFacing: "", connectedToTools: "",
  canTakeActions: "", multipleAgents: "", inProduction: "",
  toolAccess: [],
  controls: [], unsafePrevention: "", incidents: "",
  numAgents: "", sharedMemory: "", sharedTools: "", autonomousCoordination: "", crossAgentComm: "",
  compliance: [],
  successCriteria: [], successNotes: "",
  referralCode: "", referralSource: "",
};

const SECTIONS = [
  { key: "company", title: "Company information", sub: "Who we'll route your assessment to." },
  { key: "deployment", title: "AI deployment profile", sub: "Where your agents are today." },
  { key: "tools", title: "Tool access & risk surface", sub: "What your agents can reach." },
  { key: "governance", title: "Governance & controls", sub: "What's protecting actions today." },
  { key: "multiagent", title: "Multi-agent environment", sub: "Architecture complexity." },
  { key: "compliance", title: "Compliance requirements", sub: "What you're held to." },
  { key: "success", title: "Success criteria", sub: "What a good outcome looks like." },
  { key: "review", title: "Review & submit", sub: "Get your recommended pathway." },
] as const;

const TOTAL = SECTIONS.length;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AssessmentClient() {
  const [data, setData] = useState<AssessmentData>(EMPTY);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ recommendation: Recommendation; reference: string; emailed: boolean } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const restored = useRef(false);
  const topRef = useRef<HTMLDivElement>(null);

  // Restore saved progress + capture referral (?ref=). A fresh referral link
  // always wins; otherwise we keep a previously-captured one; else Direct/Unknown.
  useEffect(() => {
    let saved: { data?: Partial<AssessmentData>; step?: number } = {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch { /* ignore */ }

    const fresh = slugifyRef(new URLSearchParams(window.location.search).get("ref") ?? "");
    const referralCode = fresh || saved.data?.referralCode || "";
    const referralSource = referralCode ? humanizeRef(referralCode) : DIRECT_SOURCE;

    setData((d) => ({ ...d, ...(saved.data ?? {}), referralCode, referralSource }));
    if (typeof saved.step === "number") setStep(Math.min(Math.max(0, saved.step), TOTAL - 2));
    restored.current = true;
  }, []);

  // Autosave.
  useEffect(() => {
    if (!restored.current) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, step })); } catch { /* ignore */ }
  }, [data, step]);

  function set<K extends keyof AssessmentData>(key: K, value: AssessmentData[K]) {
    setData((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  }
  function toggle(key: "toolAccess" | "controls" | "compliance" | "successCriteria", value: string) {
    setData((d) => {
      const cur = d[key];
      return { ...d, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] };
    });
  }

  function validateCompany(): boolean {
    const e: Record<string, string> = {};
    if (!data.fullName.trim()) e.fullName = "Required";
    if (!data.jobTitle.trim()) e.jobTitle = "Required";
    if (!data.companyName.trim()) e.companyName = "Required";
    if (!EMAIL_RE.test(data.email.trim())) e.email = "Enter a valid email";
    if (!data.industry) e.industry = "Select one";
    if (!data.companySize) e.companySize = "Select one";
    if (!data.country.trim()) e.country = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function scrollTop() {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function next() {
    if (step === 0 && !validateCompany()) return;
    setStep((s) => Math.min(s + 1, TOTAL - 1));
    scrollTop();
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
    scrollTop();
  }

  async function submit() {
    if (!validateCompany()) { setStep(0); scrollTop(); return; }
    setSubmitting(true);
    setSubmitError(null);
    track(Events.CTA_CLICK, { location: "assessment", cta: "submit" });
    try {
      const res = await fetch("/api/assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.ok) {
        if (json.fieldErrors) setErrors(json.fieldErrors);
        setSubmitError(json.error || "Submission failed. Please try again.");
        setStep(0);
      } else {
        setResult({ recommendation: json.recommendation, reference: json.reference, emailed: json.delivery?.emailed });
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        scrollTop();
      }
    } catch {
      setSubmitError("Could not reach the assessment service. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    setData(EMPTY);
    setStep(0);
    setResult(null);
    setErrors({});
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    scrollTop();
  }

  const pct = Math.round(((step + 1) / TOTAL) * 100);

  return (
    <section className="rgq" aria-label="Runtime Governance Assessment">
      <div className="wrap" ref={topRef}>
        <div className="rgq-head">
          <span className="eyebrow">Runtime Governance Assessment</span>
          <h1>Assess Your Agent</h1>
          <p className="rgq-lede">
            Complete a Runtime Governance Assessment and receive a recommended engagement pathway.
            Takes <b>5–10 minutes</b> · progress is saved on this device.
          </p>
          {data.referralCode && (
            <p className="rgq-referral" aria-live="polite">Referred by <b>{data.referralSource}</b></p>
          )}
        </div>
        {/* Hidden referral attribution — captured from ?ref=, submitted with the form. */}
        <input type="hidden" name="referral_source" value={data.referralSource} />
        <input type="hidden" name="referral_code" value={data.referralCode} />

        {result ? (
          <ResultView result={result} onRestart={startOver} />
        ) : (
          <>
            {/* Progress */}
            <div className="rgq-progress" aria-hidden="true">
              <div className="rgq-progress-bar"><span style={{ width: `${pct}%` }} /></div>
              <div className="rgq-progress-meta">
                <span>Step {step + 1} of {TOTAL}</span>
                <span>{SECTIONS[step].title}</span>
              </div>
            </div>

            <div className="rgq-card">
              <div className="rgq-card-head">
                <span className="rgq-step-n">{String(step + 1).padStart(2, "0")}</span>
                <div>
                  <h2>{SECTIONS[step].title}</h2>
                  <p>{SECTIONS[step].sub}</p>
                </div>
              </div>

              <div className="rgq-fields">
                {step === 0 && <CompanyStep data={data} set={set} errors={errors} />}
                {step === 1 && <DeploymentStep data={data} set={set} />}
                {step === 2 && <MultiSelectStep title="Does any agent have access to:" options={TOOL_ACCESS} selected={data.toolAccess} onToggle={(v) => toggle("toolAccess", v)} />}
                {step === 3 && <GovernanceStep data={data} set={set} toggle={(v) => toggle("controls", v)} />}
                {step === 4 && <MultiAgentStep data={data} set={set} />}
                {step === 5 && <MultiSelectStep title="Which apply to your environment?" options={COMPLIANCE} selected={data.compliance} onToggle={(v) => toggle("compliance", v)} />}
                {step === 6 && <SuccessStep data={data} set={set} toggle={(v) => toggle("successCriteria", v)} />}
                {step === 7 && <ReviewStep data={data} goto={(s) => { setStep(s); scrollTop(); }} />}
              </div>

              {submitError && <div className="rgq-error" role="alert">{submitError}</div>}

              <div className="rgq-actions">
                {step > 0 && (
                  <button className="btn btn--ghost" onClick={back} disabled={submitting} type="button">
                    <span className="arr">←</span> Back
                  </button>
                )}
                {step < TOTAL - 1 ? (
                  <button className="btn btn--primary" onClick={next} type="button">
                    Continue <span className="arr">→</span>
                  </button>
                ) : (
                  <button className="btn btn--primary" onClick={submit} disabled={submitting} type="button">
                    {submitting ? "Generating recommendation…" : "Get my recommended pathway"} <span className="arr">→</span>
                  </button>
                )}
              </div>
            </div>

            <p className="rgq-foot">
              Prefer to upload your tool manifest for an instant Ω exposure map?{" "}
              <Link href="/assess">Try the Day-1 Ω exposure tool →</Link>
            </p>
          </>
        )}
      </div>
    </section>
  );
}

/* ── Result ─────────────────────────────────────────────────────────────── */
function ResultView({ result, onRestart }: { result: { recommendation: Recommendation; reference: string; emailed: boolean }; onRestart: () => void }) {
  const r = result.recommendation;
  return (
    <div className="rgq-result">
      <span className="rgq-result-eyebrow">{r.eyebrow ?? "Recommended engagement pathway"}</span>
      <h2 className="rgq-result-title">{r.title}</h2>
      <p className="rgq-result-tagline">{r.tagline}</p>

      <div className="rgq-why">
        <span className="rgq-why-k">Why this pathway</span>
        <ul>{r.why.map((w, i) => <li key={i}>{w}</li>)}</ul>
      </div>

      <div className="rgq-result-cta">
        <Link href={r.ctaHref} className="btn btn--primary" onClick={() => track(Events.CTA_CLICK, { location: "assessment-result", cta: r.id })}>
          {r.ctaLabel} <span className="arr">→</span>
        </Link>
        <Link href="/book#assessment" className="btn btn--ghost">{r.secondaryLabel ?? "Book a call"} <span className="arr">→</span></Link>
      </div>

      <div className="rgq-result-meta">
        <span>Reference <b>{result.reference}</b></span>
        <span>{result.emailed ? "A copy has been emailed to you." : "We've recorded your assessment."}</span>
      </div>
      <p className="rgq-result-note">
        This is a recommendation based on your answers. The questionnaire is the primary qualification —
        if we already have enough, we may suggest moving straight to an Audit, Pilot, or Integration discussion.
      </p>
      <button className="rgq-restart" onClick={onRestart} type="button">Start a new assessment</button>
    </div>
  );
}

/* ── Step inputs ────────────────────────────────────────────────────────── */
type SetFn = <K extends keyof AssessmentData>(key: K, value: AssessmentData[K]) => void;

function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="rgq-field">
      <span className="rgq-label">{label}{error && <span className="rgq-field-err"> · {error}</span>}</span>
      {children}
      {hint && <span className="rgq-hint">{hint}</span>}
    </label>
  );
}

function YesNoField({ label, value, onChange }: { label: string; value: YesNo; onChange: (v: YesNo) => void }) {
  return (
    <div className="rgq-field">
      <span className="rgq-label">{label}</span>
      <div className="rgq-seg" role="group" aria-label={label}>
        {(["yes", "no"] as const).map((v) => (
          <button key={v} type="button" className={`rgq-seg-btn${value === v ? " is-on" : ""}`} onClick={() => onChange(value === v ? "" : v)}>
            {v === "yes" ? "Yes" : "No"}
          </button>
        ))}
      </div>
    </div>
  );
}

function CompanyStep({ data, set, errors }: { data: AssessmentData; set: SetFn; errors: Record<string, string> }) {
  return (
    <div className="rgq-grid2">
      <Field label="Full name" error={errors.fullName}>
        <input className="rgq-input" value={data.fullName} onChange={(e) => set("fullName", e.target.value)} autoComplete="name" />
      </Field>
      <Field label="Job title" error={errors.jobTitle}>
        <input className="rgq-input" value={data.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} autoComplete="organization-title" />
      </Field>
      <Field label="Company name" error={errors.companyName}>
        <input className="rgq-input" value={data.companyName} onChange={(e) => set("companyName", e.target.value)} autoComplete="organization" />
      </Field>
      <Field label="Email address" error={errors.email}>
        <input className="rgq-input" type="email" value={data.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" />
      </Field>
      <Field label="Phone number" hint="Optional">
        <input className="rgq-input" value={data.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" />
      </Field>
      <Field label="Country" error={errors.country}>
        <input className="rgq-input" value={data.country} onChange={(e) => set("country", e.target.value)} autoComplete="country-name" />
      </Field>
      <Field label="Industry" error={errors.industry}>
        <select className="rgq-input" value={data.industry} onChange={(e) => set("industry", e.target.value)}>
          <option value="">Select…</option>
          {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </Field>
      <Field label="Company size" error={errors.companySize}>
        <select className="rgq-input" value={data.companySize} onChange={(e) => set("companySize", e.target.value)}>
          <option value="">Select…</option>
          {COMPANY_SIZES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
    </div>
  );
}

function DeploymentStep({ data, set }: { data: AssessmentData; set: SetFn }) {
  const isPartner = (PARTNER_INTENTS as readonly string[]).includes(data.intent);
  return (
    <div>
      <Field label="What best describes why you are exploring Resurrection Tech?">
        <select className="rgq-input" value={data.intent} onChange={(e) => set("intent", e.target.value)}>
          <option value="">Select…</option>
          {ENGAGEMENT_INTENTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>

      {isPartner && (
        <div className="rgq-partner" data-partner>
          <Field label="Which best describes your organisation?" hint="Helps us route partnership, channel, or licensing conversations.">
            <select className="rgq-input" value={data.partnerType} onChange={(e) => set("partnerType", e.target.value)}>
              <option value="">Select…</option>
              {PARTNER_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Estimated customer reach" hint="Roughly how many customers could you offer or embed Runtime Governance for?">
            <select className="rgq-input" value={data.customerReach} onChange={(e) => set("customerReach", e.target.value)}>
              <option value="">Select…</option>
              {CUSTOMER_REACH.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Who would you offer or embed Runtime Governance for?" hint="Optional — your customer base, service model, or the product you'd embed it in.">
            <textarea className="rgq-input rgq-textarea" rows={3} value={data.customerBase} onChange={(e) => set("customerBase", e.target.value)} placeholder="e.g. mid-market financial-services clients via our MSSP offering; or embedded in our agent platform." />
          </Field>
        </div>
      )}

      <Field label="Where are you in your governance journey?">
        <select className="rgq-input" value={data.stage} onChange={(e) => set("stage", e.target.value)}>
          <option value="">Select…</option>
          {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </Field>
      <div className="rgq-yesno-grid">
        <YesNoField label="Are AI agents currently deployed?" value={data.agentsDeployed} onChange={(v) => set("agentsDeployed", v)} />
        <YesNoField label="Are agents customer-facing?" value={data.customerFacing} onChange={(v) => set("customerFacing", v)} />
        <YesNoField label="Are agents connected to tools?" value={data.connectedToTools} onChange={(v) => set("connectedToTools", v)} />
        <YesNoField label="Are agents allowed to take actions?" value={data.canTakeActions} onChange={(v) => set("canTakeActions", v)} />
        <YesNoField label="Are multiple agents interacting?" value={data.multipleAgents} onChange={(v) => set("multipleAgents", v)} />
        <YesNoField label="Are agents deployed in production?" value={data.inProduction} onChange={(v) => set("inProduction", v)} />
      </div>
    </div>
  );
}

function MultiSelectStep({ title, options, selected, onToggle }: { title: string; options: { value: string; label: string }[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div>
      <span className="rgq-label">{title}</span>
      <div className="rgq-chips">
        {options.map((o) => (
          <button key={o.value} type="button" className={`rgq-chip${selected.includes(o.value) ? " is-on" : ""}`} onClick={() => onToggle(o.value)} aria-pressed={selected.includes(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function GovernanceStep({ data, set, toggle }: { data: AssessmentData; set: SetFn; toggle: (v: string) => void }) {
  return (
    <div>
      <span className="rgq-label">What controls currently exist?</span>
      <div className="rgq-chips">
        {CONTROLS.map((o) => (
          <button key={o.value} type="button" className={`rgq-chip${data.controls.includes(o.value) ? " is-on" : ""}`} onClick={() => toggle(o.value)} aria-pressed={data.controls.includes(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      <Field label="How are unsafe actions prevented today?">
        <textarea className="rgq-input rgq-textarea" rows={4} value={data.unsafePrevention} onChange={(e) => set("unsafePrevention", e.target.value)} placeholder="e.g. human approval on payments, allow-listed tools, manual review…" />
      </Field>
      <Field label="Have you experienced AI failures, near misses, or unexpected agent behaviour?">
        <textarea className="rgq-input rgq-textarea" rows={4} value={data.incidents} onChange={(e) => set("incidents", e.target.value)} placeholder="Briefly describe anything notable (optional but valuable)." />
      </Field>
    </div>
  );
}

function MultiAgentStep({ data, set }: { data: AssessmentData; set: SetFn }) {
  return (
    <div>
      <Field label="Number of agents">
        <select className="rgq-input" value={data.numAgents} onChange={(e) => set("numAgents", e.target.value)}>
          <option value="">Select…</option>
          {NUM_AGENTS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Field>
      <div className="rgq-yesno-grid">
        <YesNoField label="Shared memory?" value={data.sharedMemory} onChange={(v) => set("sharedMemory", v)} />
        <YesNoField label="Shared tools?" value={data.sharedTools} onChange={(v) => set("sharedTools", v)} />
        <YesNoField label="Autonomous coordination?" value={data.autonomousCoordination} onChange={(v) => set("autonomousCoordination", v)} />
        <YesNoField label="Cross-agent communication?" value={data.crossAgentComm} onChange={(v) => set("crossAgentComm", v)} />
      </div>
    </div>
  );
}

function SuccessStep({ data, set, toggle }: { data: AssessmentData; set: SetFn; toggle: (v: string) => void }) {
  return (
    <div>
      <span className="rgq-label">What outcome would make this engagement successful?</span>
      <div className="rgq-chips">
        {SUCCESS_CRITERIA.map((o) => (
          <button key={o.value} type="button" className={`rgq-chip${data.successCriteria.includes(o.value) ? " is-on" : ""}`} onClick={() => toggle(o.value)} aria-pressed={data.successCriteria.includes(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      <Field label="Anything else about your goals or constraints?">
        <textarea className="rgq-input rgq-textarea" rows={4} value={data.successNotes} onChange={(e) => set("successNotes", e.target.value)} placeholder="Free text — timelines, regulatory deadlines, board pressure, specific risks…" />
      </Field>
    </div>
  );
}

function ReviewStep({ data, goto }: { data: AssessmentData; goto: (s: number) => void }) {
  const yn = (v: YesNo) => (v === "yes" ? "Yes" : v === "no" ? "No" : "—");
  const lbl = (opts: { value: string; label: string }[], vals: string[]) =>
    vals.length ? vals.map((v) => opts.find((o) => o.value === v)?.label ?? v).join(", ") : "—";
  const Rrow = ({ k, v }: { k: string; v: string }) => (
    <div className="rgq-rev-row"><span>{k}</span><span>{v || "—"}</span></div>
  );
  return (
    <div className="rgq-review">
      <p className="rgq-review-intro">Review your answers, then get your recommended pathway. Tap a section to edit.</p>

      <button className="rgq-rev-group" type="button" onClick={() => goto(0)}>
        <span className="rgq-rev-h">Company <span className="rgq-edit">Edit</span></span>
        <Rrow k="Contact" v={`${data.fullName}${data.jobTitle ? `, ${data.jobTitle}` : ""}`} />
        <Rrow k="Company" v={data.companyName} />
        <Rrow k="Email" v={data.email} />
        <Rrow k="Industry / size" v={[data.industry, data.companySize].filter(Boolean).join(" · ")} />
        <Rrow k="Country" v={data.country} />
      </button>

      <button className="rgq-rev-group" type="button" onClick={() => goto(1)}>
        <span className="rgq-rev-h">Deployment <span className="rgq-edit">Edit</span></span>
        <Rrow k="Reason for exploring" v={ENGAGEMENT_INTENTS.find((o) => o.value === data.intent)?.label ?? "—"} />
        {(PARTNER_INTENTS as readonly string[]).includes(data.intent) && (
          <>
            <Rrow k="Organisation type" v={PARTNER_TYPES.find((o) => o.value === data.partnerType)?.label ?? "—"} />
            <Rrow k="Customer reach" v={CUSTOMER_REACH.find((o) => o.value === data.customerReach)?.label ?? "—"} />
          </>
        )}
        <Rrow k="Stage" v={STAGES.find((s) => s.value === data.stage)?.label ?? "—"} />
        <Rrow k="In production" v={yn(data.inProduction)} />
        <Rrow k="Takes actions" v={yn(data.canTakeActions)} />
        <Rrow k="Multiple agents" v={yn(data.multipleAgents)} />
      </button>

      <button className="rgq-rev-group" type="button" onClick={() => goto(2)}>
        <span className="rgq-rev-h">Tool access <span className="rgq-edit">Edit</span></span>
        <Rrow k="Access" v={lbl(TOOL_ACCESS, data.toolAccess)} />
      </button>

      <button className="rgq-rev-group" type="button" onClick={() => goto(3)}>
        <span className="rgq-rev-h">Governance <span className="rgq-edit">Edit</span></span>
        <Rrow k="Controls" v={lbl(CONTROLS, data.controls)} />
      </button>

      <button className="rgq-rev-group" type="button" onClick={() => goto(5)}>
        <span className="rgq-rev-h">Compliance <span className="rgq-edit">Edit</span></span>
        <Rrow k="Requirements" v={lbl(COMPLIANCE, data.compliance)} />
      </button>

      <button className="rgq-rev-group" type="button" onClick={() => goto(6)}>
        <span className="rgq-rev-h">Success criteria <span className="rgq-edit">Edit</span></span>
        <Rrow k="Goals" v={lbl(SUCCESS_CRITERIA, data.successCriteria)} />
      </button>
    </div>
  );
}
