"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { track, Events } from "@/lib/analytics";
import {
  INDUSTRIES, COMPANY_SIZES, COUNTRIES, STAGES, TOOL_ACCESS, CONTROLS, COMPLIANCE,
  SUCCESS_CRITERIA, NUM_AGENTS, ENGAGEMENT_INTENTS, PARTNER_TYPES, CUSTOMER_REACH,
  CUSTOMER_REACH_POTENTIAL, PARTNER_INTENTS, REGIONS, AI_MATURITY, AI_MATURITY_TARGET,
  CUSTOMERS_CURRENT, CUSTOMERS_FUTURE, REVENUE_EXPOSURE, REVENUE_EXPOSURE_FUTURE,
  EXECUTION_PERMISSIONS, DEPLOYMENT_MODELS, CLOUD_PROVIDERS, MODEL_STACK, AGENT_STACK,
  PROTECTED_ENVIRONMENTS, AGENTS_EXPECTED, GOVERNANCE_OPS, GOVERNANCE_TARGETS,
  EVIDENCE_REQUIREMENTS, EXEC_OVERSIGHT, EXEC_NEED, TIMELINES,
  type AssessmentData, type Recommendation, type YesNo, type Option,
} from "@/lib/assessment";
import { slugifyRef, humanizeRef, DIRECT_SOURCE } from "@/lib/referral";
import { REPORT_STORAGE_KEY, type StoredReport } from "@/lib/assessmentReport";
import { PricingDisclaimer } from "@/components/PricingDisclaimer";
import {
  EMPTY_ASSESSMENT, blankAssessment, errorMapFrom, issuesFromFieldErrors, maxLengthOf,
  sectionsForStep, summaryHeading, validateAssessment,
  type SectionKey, type ValidationIssue,
} from "@/lib/assessmentFields";

const STORAGE_KEY = "rt-assessment-v2";

const EMPTY: AssessmentData = EMPTY_ASSESSMENT;

/** Character cap for a field, taken from the shared specs the API validates against. */
const cap = (key: keyof AssessmentData) => maxLengthOf(key);

/** Every string[] field the chip toggles operate on. */
type MultiKey =
  | "operatingRegions" | "deploymentRegions" | "toolAccess" | "executionPermissions"
  | "deploymentModel" | "cloudProviders" | "modelStack" | "agentStack"
  | "controls" | "governanceOps" | "compliance" | "evidenceRequirements" | "successCriteria";

const SECTIONS = [
  { key: "organisation", title: "Organisation", sub: "Who you are and where you operate — this routes your assessment and frames regulatory context." },
  { key: "programme", title: "AI programme", sub: "Where your AI programme is today and where it is heading — current state and target state are asked separately." },
  { key: "risk", title: "Runtime risk", sub: "What your agents can reach and do, and who is affected — this drives the Ω exposure estimate." },
  { key: "architecture", title: "Technical architecture", sub: "How your AI estate is built and deployed — this sizes the governance scope." },
  { key: "governance", title: "Governance", sub: "The controls you have today and the state you want to reach — the gap defines the engagement." },
  { key: "compliance", title: "Compliance & oversight", sub: "What you are held to, who consumes governance evidence, and who owns AI risk." },
  { key: "commercial", title: "Commercial qualification", sub: "Why you are here, how ready you are, and what success looks like — this selects your pathway." },
  { key: "review", title: "Review & recommended pathway", sub: "Check your answers, then get your recommended engagement pathway." },
] as const;

const TOTAL = SECTIONS.length;

export function AssessmentClient() {
  const [data, setData] = useState<AssessmentData>(EMPTY);
  const [step, setStep] = useState(0);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ recommendation: Recommendation; reference: string; emailed: boolean } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Autosave must not run until the saved answers have actually been committed
  // to state, or the first render would write a blank form over saved progress.
  const [hydrated, setHydrated] = useState(false);
  // Bumped whenever a validation failure needs to be announced and scrolled to.
  const [announce, setAnnounce] = useState(0);
  // Guards a double-click: `submitting` only takes effect on the next render.
  const inFlight = useRef(false);
  const topRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const errors = errorMapFrom(issues);

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
    if (typeof saved.step === "number") setStep(Math.min(Math.max(0, saved.step), TOTAL - 1));
    setHydrated(true);
  }, []);

  // Autosave.
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, step })); } catch { /* ignore */ }
  }, [hydrated, data, step]);

  function clearIssue(key: string) {
    setIssues((list) => (list.some((i) => i.key === key) ? list.filter((i) => i.key !== key) : list));
  }

  function set<K extends keyof AssessmentData>(key: K, value: AssessmentData[K]) {
    setData((d) => ({ ...d, [key]: value }));
    clearIssue(key as string);
  }
  function toggle(key: MultiKey, value: string) {
    setData((d) => {
      const cur = d[key] ?? [];
      return { ...d, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] };
    });
    clearIssue(key);
  }

  function scrollTop() {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** Surface a validation failure where the participant can act on it. */
  function reportIssues(found: ValidationIssue[]) {
    setIssues(found);
    setAnnounce((n) => n + 1);
  }

  // Bring the summary into view once it has actually rendered, so a failed
  // submit is never silent — the participant lands on the list of what to fix.
  useEffect(() => {
    if (!announce) return;
    const el = summaryRef.current;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus({ preventScroll: true });
    } else {
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [announce]);

  function next() {
    const found = validateAssessment(data, sectionsForStep(step));
    if (found.length) { reportIssues(found); return; }
    setIssues([]);
    setStep((s) => Math.min(s + 1, TOTAL - 1));
    scrollTop();
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
    scrollTop();
  }

  function goto(s: number) {
    setStep(s);
    scrollTop();
  }

  async function submit() {
    // Already submitted, or a submission is in flight — never send twice.
    if (inFlight.current || submitting || result) return;

    const found = validateAssessment(data);
    if (found.length) {
      setSubmitError(null);
      reportIssues(found);
      return;
    }

    inFlight.current = true;
    setIssues([]);
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
        // Answers are never discarded on failure — the participant stays on the
        // review stage with the offending fields named and linked.
        const serverIssues = issuesFromFieldErrors(json.fieldErrors, data);
        if (serverIssues.length) {
          reportIssues(serverIssues);
          setSubmitError(null);
        } else {
          setSubmitError(json.error || "Submission failed. Please try again — your answers have been kept.");
          scrollTop();
        }
      } else {
        setResult({ recommendation: json.recommendation, reference: json.reference, emailed: json.delivery?.emailed });
        // Persist the full submission on this device so /assessment/report can
        // render the executive report (presentation only — engine untouched).
        try {
          const stored: StoredReport = {
            data, recommendation: json.recommendation, reference: json.reference,
            submittedAt: new Date().toISOString(),
          };
          localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(stored));
        } catch { /* ignore */ }
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        scrollTop();
      }
    } catch {
      setSubmitError("Could not reach the assessment service. Your answers have been kept — please try again.");
      scrollTop();
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  function startOver() {
    setData(blankAssessment());
    setStep(0);
    setResult(null);
    setIssues([]);
    setSubmitError(null);
    inFlight.current = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    scrollTop();
  }

  const pct = Math.round(((step + 1) / TOTAL) * 100);
  const invalidSections = new Set<SectionKey>(
    issues.map((i) => i.section).filter((s): s is SectionKey => s !== null),
  );

  return (
    <section className="rgq" aria-label="Runtime Governance Assessment">
      <div className="wrap" ref={topRef}>
        <div className="rgq-head">
          <span className="eyebrow">Runtime Governance Assessment</span>
          <h1>Assess Your Agent</h1>
          <p className="rgq-lede">
            An executive qualification of your AI estate. Answer what you can — every question
            sharpens your recommended pathway. Takes <b>8–12 minutes</b> · progress is saved on
            this device.
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
                <span>Stage {step + 1} of {TOTAL}</span>
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

              <ErrorSummary issues={issues} onJump={goto} summaryRef={summaryRef} />

              <div className="rgq-fields">
                {step === 0 && <OrganisationStep data={data} set={set} errors={errors} toggle={toggle} />}
                {step === 1 && <ProgrammeStep data={data} set={set} />}
                {step === 2 && <RiskStep data={data} set={set} toggle={toggle} />}
                {step === 3 && <ArchitectureStep data={data} set={set} toggle={toggle} />}
                {step === 4 && <GovernanceStep data={data} set={set} toggle={toggle} />}
                {step === 5 && <ComplianceStep data={data} set={set} toggle={toggle} />}
                {step === 6 && <CommercialStep data={data} set={set} toggle={toggle} />}
                {step === 7 && <ReviewStep data={data} goto={goto} invalidSections={invalidSections} />}
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
                  <button
                    className="btn btn--primary"
                    onClick={submit}
                    disabled={submitting}
                    aria-busy={submitting}
                    data-testid="assessment-submit"
                    type="button"
                  >
                    {submitting ? (
                      <>
                        <span className="rgq-spinner" aria-hidden="true" /> Generating recommendation…
                      </>
                    ) : (
                      <>Get my recommended pathway <span className="arr">→</span></>
                    )}
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

/* ── Validation summary ─────────────────────────────────────────────────── */
/**
 * Names every field that is missing or invalid, in the participant's own
 * language, and links each one to the stage that owns it. Internal field keys
 * are never rendered — the summary works from the shared field specs.
 */
function ErrorSummary({ issues, onJump, summaryRef }: {
  issues: ValidationIssue[];
  onJump: (step: number) => void;
  summaryRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (!issues.length) return null;
  return (
    <div className="rgq-summary" role="alert" tabIndex={-1} ref={summaryRef} data-testid="assessment-error-summary">
      <p className="rgq-summary-h">{summaryHeading(issues)}</p>
      <ul className="rgq-summary-list">
        {issues.map((i) => (
          <li key={i.key}>
            {i.step >= 0 ? (
              <button type="button" className="rgq-summary-link" onClick={() => onJump(i.step)}>
                {i.sectionLabel} — {i.label}
              </button>
            ) : (
              <span className="rgq-summary-link is-static">{i.sectionLabel}</span>
            )}
            {!i.missing && <span className="rgq-summary-why">{i.message}</span>}
          </li>
        ))}
      </ul>
    </div>
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

      {r.summary && <p className="rgq-result-summary">{r.summary}</p>}

      <div className="rgq-why">
        <span className="rgq-why-k">Why this pathway</span>
        <ul>{r.why.map((w, i) => <li key={i}>{w}</li>)}</ul>
      </div>

      {r.band && (
        <div className="rgq-result-meta" style={{ marginTop: 4 }}>
          <span>Indicative engagement scale <b>{r.band}</b></span>
        </div>
      )}

      <div className="rgq-result-cta">
        <Link
          href="/assessment/report"
          className="btn btn--primary"
          onClick={() => track(Events.CTA_CLICK, { location: "assessment-result", cta: "executive-report" })}
        >
          View your executive report <span className="arr">→</span>
        </Link>
        <Link href={r.ctaHref} className="btn btn--ghost" onClick={() => track(Events.CTA_CLICK, { location: "assessment-result", cta: r.id })}>
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
      <PricingDisclaimer variant="short" />
      <button className="rgq-restart" onClick={onRestart} type="button">Start a new assessment</button>
    </div>
  );
}

/* ── Shared inputs ──────────────────────────────────────────────────────── */
type SetFn = <K extends keyof AssessmentData>(key: K, value: AssessmentData[K]) => void;
type ToggleFn = (key: MultiKey, value: string) => void;

function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="rgq-field">
      <span className="rgq-label">{label}{error && <span className="rgq-field-err"> · {error}</span>}</span>
      {children}
      {hint && <span className="rgq-hint">{hint}</span>}
    </label>
  );
}

function SelectField({ label, hint, value, options, onChange, error }: {
  label: string; hint?: string; value: string; options: Option[]; onChange: (v: string) => void; error?: string;
}) {
  return (
    <Field label={label} hint={hint} error={error}>
      <select className="rgq-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
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

function Chips({ label, hint, options, selected, onToggle }: {
  label: string; hint?: string; options: Option[]; selected: string[]; onToggle: (v: string) => void;
}) {
  return (
    <div className="rgq-field">
      <span className="rgq-label">{label}</span>
      {hint && <span className="rgq-hint">{hint}</span>}
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

/* ── Stage 1 · Organisation ─────────────────────────────────────────────── */
function OrganisationStep({ data, set, errors, toggle }: { data: AssessmentData; set: SetFn; errors: Record<string, string>; toggle: ToggleFn }) {
  return (
    <div>
      <div className="rgq-grid2">
        <Field label="Full name" error={errors.fullName}>
          <input className="rgq-input" maxLength={cap("fullName")} value={data.fullName} onChange={(e) => set("fullName", e.target.value)} autoComplete="name" />
        </Field>
        <Field label="Job title" error={errors.jobTitle}>
          <input className="rgq-input" maxLength={cap("jobTitle")} value={data.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} autoComplete="organization-title" />
        </Field>
        <Field label="Company name" error={errors.companyName}>
          <input className="rgq-input" maxLength={cap("companyName")} value={data.companyName} onChange={(e) => set("companyName", e.target.value)} autoComplete="organization" />
        </Field>
        <Field label="Email address" error={errors.email}>
          <input className="rgq-input" type="email" maxLength={cap("email")} value={data.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Phone number" hint="Optional">
          <input className="rgq-input" maxLength={cap("phone")} value={data.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" />
        </Field>
        <Field label="Headquarters country" error={errors.country}>
          <select className="rgq-input" value={data.country} onChange={(e) => set("country", e.target.value)} autoComplete="country-name">
            <option value="">Select…</option>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Industry" error={errors.industry}>
          <select className="rgq-input" value={data.industry} onChange={(e) => set("industry", e.target.value)}>
            <option value="">Select…</option>
            {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="Organisation size" error={errors.companySize}>
          <select className="rgq-input" value={data.companySize} onChange={(e) => set("companySize", e.target.value)}>
            <option value="">Select…</option>
            {COMPANY_SIZES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <Chips label="Where does your organisation operate?" hint="Select all that apply."
        options={REGIONS} selected={data.operatingRegions} onToggle={(v) => toggle("operatingRegions", v)} />
      <Chips label="Where are your AI systems deployed, or planned to be deployed?" hint="Deployment regions drive data-residency and regulatory scope."
        options={REGIONS} selected={data.deploymentRegions} onToggle={(v) => toggle("deploymentRegions", v)} />
    </div>
  );
}

/* ── Stage 2 · AI programme (current vs target) ─────────────────────────── */
function ProgrammeStep({ data, set }: { data: AssessmentData; set: SetFn }) {
  return (
    <div>
      <div className="rgq-grid2">
        <SelectField
          label="Current state — where is your AI programme today?"
          hint="Answer for what is running now, not what is planned."
          value={data.aiMaturityCurrent} options={AI_MATURITY}
          onChange={(v) => set("aiMaturityCurrent", v)}
        />
        <SelectField
          label="Target state — where should it be in 12–18 months?"
          hint="A realistic target is fine — this shapes the pathway, not the commitment."
          value={data.aiMaturityTarget} options={AI_MATURITY_TARGET}
          onChange={(v) => set("aiMaturityTarget", v)}
        />
      </div>
      <span className="rgq-label" style={{ marginTop: 8 }}>Today — current production reality:</span>
      <div className="rgq-yesno-grid">
        <YesNoField label="Are AI agents currently deployed?" value={data.agentsDeployed} onChange={(v) => set("agentsDeployed", v)} />
        <YesNoField label="Are agents customer-facing today?" value={data.customerFacing} onChange={(v) => set("customerFacing", v)} />
        <YesNoField label="Are agents connected to tools?" value={data.connectedToTools} onChange={(v) => set("connectedToTools", v)} />
        <YesNoField label="Can agents take actions without a human in the loop?" value={data.canTakeActions} onChange={(v) => set("canTakeActions", v)} />
        <YesNoField label="Are multiple agents interacting?" value={data.multipleAgents} onChange={(v) => set("multipleAgents", v)} />
        <YesNoField label="Are agents running in production?" value={data.inProduction} onChange={(v) => set("inProduction", v)} />
      </div>
    </div>
  );
}

/* ── Stage 3 · Runtime risk ─────────────────────────────────────────────── */
function RiskStep({ data, set, toggle }: { data: AssessmentData; set: SetFn; toggle: ToggleFn }) {
  return (
    <div>
      <Chips label="What can your agents reach today?" options={TOOL_ACCESS}
        selected={data.toolAccess} onToggle={(v) => toggle("toolAccess", v)} />
      <Chips label="What are agents permitted to do?" hint="Select all that apply to any agent."
        options={EXECUTION_PERMISSIONS} selected={data.executionPermissions} onToggle={(v) => toggle("executionPermissions", v)} />
      <div className="rgq-yesno-grid">
        <YesNoField label="Do agents touch business-critical systems?" value={data.criticalSystems} onChange={(v) => set("criticalSystems", v)} />
        <YesNoField label="Do agent outputs trigger further automated actions downstream?" value={data.downstreamAutomation} onChange={(v) => set("downstreamAutomation", v)} />
      </div>
      <div className="rgq-grid2">
        <SelectField
          label="Current reality — how many active end customers currently use AI systems covered by this engagement?"
          hint="Count only customers in production today — not pipeline or ambition."
          value={data.customersCurrent} options={CUSTOMERS_CURRENT}
          onChange={(v) => set("customersCurrent", v)}
        />
        <SelectField
          label="Future scale — if your AI programme succeeds, approximately how many end customers could eventually be affected?"
          hint="Your honest ceiling — this sizes future exposure, not today's."
          value={data.customersFuture} options={CUSTOMERS_FUTURE}
          onChange={(v) => set("customersFuture", v)}
        />
      </div>
      <div className="rgq-grid2">
        <SelectField
          label="Current reality — annual value flowing through AI-touched processes today"
          hint="Revenue, payments, or transactions agents can influence now."
          value={data.revenueExposureCurrent} options={REVENUE_EXPOSURE}
          onChange={(v) => set("revenueExposureCurrent", v)}
        />
        <SelectField
          label="Future scale — value at stake once the programme reaches its target"
          hint="At target scale, not today."
          value={data.revenueExposureFuture} options={REVENUE_EXPOSURE_FUTURE}
          onChange={(v) => set("revenueExposureFuture", v)}
        />
      </div>
    </div>
  );
}

/* ── Stage 4 · Technical architecture ───────────────────────────────────── */
function ArchitectureStep({ data, set, toggle }: { data: AssessmentData; set: SetFn; toggle: ToggleFn }) {
  return (
    <div>
      <Chips label="How is your AI estate deployed?" options={DEPLOYMENT_MODELS}
        selected={data.deploymentModel} onToggle={(v) => toggle("deploymentModel", v)} />
      <Chips label="Which cloud providers are involved?" options={CLOUD_PROVIDERS}
        selected={data.cloudProviders} onToggle={(v) => toggle("cloudProviders", v)} />
      <Chips label="Which model providers are in use?" options={MODEL_STACK}
        selected={data.modelStack} onToggle={(v) => toggle("modelStack", v)} />
      <Chips label="Which agent frameworks or orchestration layers?" options={AGENT_STACK}
        selected={data.agentStack} onToggle={(v) => toggle("agentStack", v)} />
      <div className="rgq-grid2">
        <SelectField
          label="How many distinct environments would need governing?"
          hint="Production, staging, per-region, per-business-unit — distinct governed environments."
          value={data.protectedEnvironments} options={PROTECTED_ENVIRONMENTS}
          onChange={(v) => set("protectedEnvironments", v)}
        />
        <Field label="Current reality — AI agents running today">
          <select className="rgq-input" value={data.numAgents} onChange={(e) => set("numAgents", e.target.value)}>
            <option value="">Select…</option>
            {NUM_AGENTS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
      </div>
      <div className="rgq-grid2">
        <SelectField
          label="Future scale — expected agent count in 12–18 months"
          hint="Relative to today."
          value={data.agentsExpected} options={AGENTS_EXPECTED}
          onChange={(v) => set("agentsExpected", v)}
        />
        <Field label="Exact agent count" hint="Optional — sharpens your recommendation">
          <input className="rgq-input" type="number" min={0} inputMode="numeric" placeholder="e.g. 14" maxLength={cap("agentCount")}
            value={data.agentCount ?? ""} onChange={(e) => set("agentCount", e.target.value.slice(0, cap("agentCount")))} />
        </Field>
      </div>
      <div className="rgq-grid2">
        <Field label="Business units involved" hint="Optional — how many units the agents span">
          <input className="rgq-input" type="number" min={0} inputMode="numeric" placeholder="e.g. 3" maxLength={cap("businessUnits")}
            value={data.businessUnits ?? ""} onChange={(e) => set("businessUnits", e.target.value.slice(0, cap("businessUnits")))} />
        </Field>
      </div>
      <div className="rgq-yesno-grid">
        <YesNoField label="Shared memory between agents?" value={data.sharedMemory} onChange={(v) => set("sharedMemory", v)} />
        <YesNoField label="Shared tools between agents?" value={data.sharedTools} onChange={(v) => set("sharedTools", v)} />
        <YesNoField label="Autonomous coordination?" value={data.autonomousCoordination} onChange={(v) => set("autonomousCoordination", v)} />
        <YesNoField label="Cross-agent communication?" value={data.crossAgentComm} onChange={(v) => set("crossAgentComm", v)} />
      </div>
    </div>
  );
}

/* ── Stage 5 · Governance (current vs target) ───────────────────────────── */
function GovernanceStep({ data, set, toggle }: { data: AssessmentData; set: SetFn; toggle: ToggleFn }) {
  return (
    <div>
      <Chips label="Current state — which technical controls exist today?" options={CONTROLS}
        selected={data.controls} onToggle={(v) => toggle("controls", v)} />
      <Chips label="Current state — which governance operations exist today?"
        hint="The operational side: workflows, evidence, oversight."
        options={GOVERNANCE_OPS} selected={data.governanceOps} onToggle={(v) => toggle("governanceOps", v)} />
      <SelectField
        label="Target state — where should governance be in 12 months?"
        value={data.governanceTarget} options={GOVERNANCE_TARGETS}
        onChange={(v) => set("governanceTarget", v)}
      />
      <Field label="How are unsafe actions prevented today?">
        <textarea className="rgq-input rgq-textarea" rows={4} maxLength={cap("unsafePrevention")} value={data.unsafePrevention} onChange={(e) => set("unsafePrevention", e.target.value)} placeholder="e.g. human approval on payments, allow-listed tools, manual review…" />
      </Field>
      <Field label="Have you experienced AI failures, near misses, or unexpected agent behaviour?">
        <textarea className="rgq-input rgq-textarea" rows={4} maxLength={cap("incidents")} value={data.incidents} onChange={(e) => set("incidents", e.target.value)} placeholder="Briefly describe anything notable (optional but valuable)." />
      </Field>
    </div>
  );
}

/* ── Stage 6 · Compliance & oversight ───────────────────────────────────── */
function ComplianceStep({ data, set, toggle }: { data: AssessmentData; set: SetFn; toggle: ToggleFn }) {
  return (
    <div>
      <Chips label="Which compliance regimes apply to your environment?" options={COMPLIANCE}
        selected={data.compliance} onToggle={(v) => toggle("compliance", v)} />
      <Chips label="Who needs to consume governance evidence?"
        hint="Determines the evidence and reporting requirements of the engagement."
        options={EVIDENCE_REQUIREMENTS} selected={data.evidenceRequirements} onToggle={(v) => toggle("evidenceRequirements", v)} />
      <div className="rgq-grid2">
        <SelectField
          label="Who owns AI risk in your organisation today?"
          value={data.execOversight} options={EXEC_OVERSIGHT}
          onChange={(v) => set("execOversight", v)}
        />
        <SelectField
          label="Do you need executive-level governance leadership?"
          hint="Advisory or fractional executive support alongside the engagement."
          value={data.execNeed} options={EXEC_NEED}
          onChange={(v) => set("execNeed", v)}
        />
      </div>
    </div>
  );
}

/* ── Stage 7 · Commercial qualification ─────────────────────────────────── */
function CommercialStep({ data, set, toggle }: { data: AssessmentData; set: SetFn; toggle: ToggleFn }) {
  const isPartner = (PARTNER_INTENTS as readonly string[]).includes(data.intent);
  return (
    <div>
      <SelectField
        label="What best describes why you are exploring Resurrection Tech?"
        value={data.intent} options={ENGAGEMENT_INTENTS}
        onChange={(v) => set("intent", v)}
      />

      {isPartner && (
        <div className="rgq-partner" data-partner>
          <SelectField
            label="Which best describes your organisation?"
            hint="Helps us route partnership, channel, or licensing conversations."
            value={data.partnerType} options={PARTNER_TYPES}
            onChange={(v) => set("partnerType", v)}
          />
          <div className="rgq-grid2">
            <SelectField
              label="Current reality — how many customers do you actively serve today?"
              hint="Your customer base as it stands now."
              value={data.customerReach} options={CUSTOMER_REACH}
              onChange={(v) => set("customerReach", v)}
            />
            <SelectField
              label="Future scale — if the partnership succeeds, how many customers could you eventually offer it to?"
              hint="Potential reach, not today's book."
              value={data.customerReachPotential} options={CUSTOMER_REACH_POTENTIAL}
              onChange={(v) => set("customerReachPotential", v)}
            />
          </div>
          <Field label="Who would you offer or embed Runtime Governance for?" hint="Optional — your customer base, service model, or the product you'd embed it in.">
            <textarea className="rgq-input rgq-textarea" rows={3} maxLength={cap("customerBase")} value={data.customerBase} onChange={(e) => set("customerBase", e.target.value)} placeholder="e.g. mid-market financial-services clients via our MSSP offering; or embedded in our agent platform." />
          </Field>
        </div>
      )}

      <div className="rgq-grid2">
        <SelectField
          label="How ready are you to act?"
          value={data.stage} options={STAGES}
          onChange={(v) => set("stage", v)}
        />
        <SelectField
          label="When do you need runtime governance in place?"
          value={data.timeline} options={TIMELINES}
          onChange={(v) => set("timeline", v)}
        />
      </div>

      <Chips label="What outcome would make this engagement successful?" options={SUCCESS_CRITERIA}
        selected={data.successCriteria} onToggle={(v) => toggle("successCriteria", v)} />
      <Field label="Anything else about your goals or constraints?">
        <textarea className="rgq-input rgq-textarea" rows={4} maxLength={cap("successNotes")} value={data.successNotes} onChange={(e) => set("successNotes", e.target.value)} placeholder="Free text — timelines, regulatory deadlines, board pressure, specific risks…" />
      </Field>
    </div>
  );
}

/* ── Stage 8 · Review ───────────────────────────────────────────────────── */
function ReviewStep({ data, goto, invalidSections }: {
  data: AssessmentData; goto: (s: number) => void; invalidSections: Set<SectionKey>;
}) {
  const yn = (v: YesNo) => (v === "yes" ? "Yes" : v === "no" ? "No" : "—");
  const lbl = (opts: Option[], vals: string[]) =>
    vals.length ? vals.map((v) => opts.find((o) => o.value === v)?.label ?? v).join(", ") : "—";
  const one = (opts: Option[], val: string) => opts.find((o) => o.value === val)?.label ?? "—";
  const Rrow = ({ k, v }: { k: string; v: string }) => (
    <div className="rgq-rev-row"><span>{k}</span><span>{v || "—"}</span></div>
  );
  /** Highlights the section a validation failure belongs to. */
  const cls = (s: SectionKey) => `rgq-rev-group${invalidSections.has(s) ? " is-invalid" : ""}`;
  return (
    <div className="rgq-review">
      <p className="rgq-review-intro">Review your answers, then get your recommended pathway. Tap a section to edit.</p>

      <button className={cls("organisation")} data-section="organisation" type="button" onClick={() => goto(0)}>
        <span className="rgq-rev-h">Organisation <span className="rgq-edit">Edit</span></span>
        <Rrow k="Contact" v={`${data.fullName}${data.jobTitle ? `, ${data.jobTitle}` : ""}`} />
        <Rrow k="Company" v={data.companyName} />
        <Rrow k="Email" v={data.email} />
        <Rrow k="Industry / size" v={[data.industry, data.companySize].filter(Boolean).join(" · ")} />
        <Rrow k="HQ / operating regions" v={[data.country, lbl(REGIONS, data.operatingRegions)].filter((s) => s && s !== "—").join(" · ")} />
      </button>

      <button className={cls("programme")} data-section="programme" type="button" onClick={() => goto(1)}>
        <span className="rgq-rev-h">AI programme <span className="rgq-edit">Edit</span></span>
        <Rrow k="Maturity today" v={one(AI_MATURITY, data.aiMaturityCurrent)} />
        <Rrow k="Target (12–18 mo)" v={one(AI_MATURITY_TARGET, data.aiMaturityTarget)} />
        <Rrow k="In production" v={yn(data.inProduction)} />
        <Rrow k="Takes actions" v={yn(data.canTakeActions)} />
      </button>

      <button className={cls("risk")} data-section="risk" type="button" onClick={() => goto(2)}>
        <span className="rgq-rev-h">Runtime risk <span className="rgq-edit">Edit</span></span>
        <Rrow k="Tool access" v={lbl(TOOL_ACCESS, data.toolAccess)} />
        <Rrow k="Permissions" v={lbl(EXECUTION_PERMISSIONS, data.executionPermissions)} />
        <Rrow k="Customers today / future" v={[one(CUSTOMERS_CURRENT, data.customersCurrent), one(CUSTOMERS_FUTURE, data.customersFuture)].join(" → ")} />
      </button>

      <button className={cls("architecture")} data-section="architecture" type="button" onClick={() => goto(3)}>
        <span className="rgq-rev-h">Architecture <span className="rgq-edit">Edit</span></span>
        <Rrow k="Deployment" v={lbl(DEPLOYMENT_MODELS, data.deploymentModel)} />
        <Rrow k="Environments" v={one(PROTECTED_ENVIRONMENTS, data.protectedEnvironments)} />
        <Rrow k="Agents today / expected" v={[data.numAgents || "—", one(AGENTS_EXPECTED, data.agentsExpected)].join(" → ")} />
      </button>

      <button className={cls("governance")} data-section="governance" type="button" onClick={() => goto(4)}>
        <span className="rgq-rev-h">Governance <span className="rgq-edit">Edit</span></span>
        <Rrow k="Controls today" v={lbl(CONTROLS, data.controls)} />
        <Rrow k="Operations today" v={lbl(GOVERNANCE_OPS, data.governanceOps)} />
        <Rrow k="Target (12 mo)" v={one(GOVERNANCE_TARGETS, data.governanceTarget)} />
      </button>

      <button className={cls("compliance")} data-section="compliance" type="button" onClick={() => goto(5)}>
        <span className="rgq-rev-h">Compliance &amp; oversight <span className="rgq-edit">Edit</span></span>
        <Rrow k="Requirements" v={lbl(COMPLIANCE, data.compliance)} />
        <Rrow k="Evidence consumers" v={lbl(EVIDENCE_REQUIREMENTS, data.evidenceRequirements)} />
        <Rrow k="AI risk owner" v={one(EXEC_OVERSIGHT, data.execOversight)} />
      </button>

      <button className={cls("commercial")} data-section="commercial" type="button" onClick={() => goto(6)}>
        <span className="rgq-rev-h">Commercial <span className="rgq-edit">Edit</span></span>
        <Rrow k="Reason" v={ENGAGEMENT_INTENTS.find((o) => o.value === data.intent)?.label ?? "—"} />
        <Rrow k="Readiness / timeline" v={[one(STAGES, data.stage), one(TIMELINES, data.timeline)].filter((s) => s !== "—").join(" · ")} />
        <Rrow k="Goals" v={lbl(SUCCESS_CRITERIA, data.successCriteria)} />
      </button>
    </div>
  );
}
