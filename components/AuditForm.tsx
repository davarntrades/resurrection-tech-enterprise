"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { CanvasScript } from "@/components/CanvasScript";
import { PricingDisclaimer } from "@/components/PricingDisclaimer";
import {
  INDUSTRIES,
  capabilitiesFor,
  exposureLabelFor,
  scoreRisk,
  estimatedInvestment,
  AUTONOMY_BY_STATUS,
  type RiskLevel,
} from "@/lib/industries";
import { track, Events } from "@/lib/analytics";
import type { AuditSubmitResponse } from "@/lib/types";

const SYSTEM_TYPES = [
  "Internal assistant",
  "Customer-facing agent",
  "Multi-agent system",
  "Tool-using agent",
  "Autonomous workflow",
  "Other",
];
const STATUS = ["Prototype", "Staging", "In production"];
const TEAM_SIZES = ["1–10", "11–50", "51–200", "201–1,000", "1,000+"];

const LEVEL_COLOR: Record<RiskLevel, string> = {
  Low: "var(--accent)",
  Medium: "var(--accent-bright)",
  High: "var(--accent-purple)",
  Critical: "var(--omega)",
};
const SEG_CLASS = ["on1", "on2", "on3", "on4"];

interface FormState {
  company_name: string;
  industry: string;
  website: string;
  team_size: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  agent_platform: string;
  models_used: string;
  ai_system_type: string[];
  deployment_type: string;
  risk_capabilities: string[];
}

const EMPTY: FormState = {
  company_name: "",
  industry: "",
  website: "",
  team_size: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  agent_platform: "",
  models_used: "",
  ai_system_type: [],
  deployment_type: "",
  risk_capabilities: [],
};

const Tick = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
    <path d="M2.5 6.2 L5 8.7 L9.5 3.3" stroke="#fff" strokeWidth="1.6" />
  </svg>
);
const CheckBig = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 8.5 L6.5 12 L13 4" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);

export function AuditForm() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ reference: string } | null>(null);
  const [serverError, setServerError] = useState("");
  // Honeypot
  const [honey, setHoney] = useState("");

  const TOTAL = 4;
  const caps = useMemo(() => capabilitiesFor(form.industry), [form.industry]);
  const exposureLabel = exposureLabelFor(form.industry);
  const risk = useMemo(
    () => scoreRisk(form.risk_capabilities, caps),
    [form.risk_capabilities, caps],
  );
  const autonomy = AUTONOMY_BY_STATUS[form.deployment_type] ?? "—";
  const investment = estimatedInvestment(risk.level);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  }

  function toggleArray(key: "ai_system_type" | "risk_capabilities", value: string) {
    setForm((f) => {
      const has = f[key].includes(value);
      return { ...f, [key]: has ? f[key].filter((v) => v !== value) : [...f[key], value] };
    });
  }

  // When industry changes, drop capability selections that no longer exist.
  function changeIndustry(label: string) {
    const validIds = new Set(capabilitiesFor(label).map((c) => c.id));
    setForm((f) => ({
      ...f,
      industry: label,
      risk_capabilities: f.risk_capabilities.filter((id) => validIds.has(id)),
    }));
  }

  function validateStep1(): boolean {
    const e: Record<string, string> = {};
    if (!form.company_name.trim()) e.company_name = "Required.";
    if (!form.contact_name.trim()) e.contact_name = "Required.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.contact_email.trim()))
      e.contact_email = "Enter a valid work email.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (step === 0 && !validateStep1()) return;
    if (step < TOTAL - 1) {
      const n = step + 1;
      setStep(n);
      track(Events.AUDIT_STEP, { step: n + 1 });
    } else {
      submit();
    }
  }
  function back() {
    if (step > 0) setStep(step - 1);
  }

  async function submit() {
    setSubmitting(true);
    setServerError("");
    const selectedCapLabels = caps
      .filter((c) => form.risk_capabilities.includes(c.id))
      .map((c) => c.label);
    const payload = {
      ...form,
      autonomy_level: autonomy,
      risk_summary: `${risk.level} Exposure`,
      // store human-readable capability labels for the team
      risk_capabilities: selectedCapLabels,
      estimated_investment: investment,
      audit_scope: "48-Hour Runtime Governance Audit™",
      company_url_confirm: honey,
    };
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: AuditSubmitResponse = await res.json();
      if (!res.ok || !data.ok) {
        if (data.fieldErrors) setErrors(data.fieldErrors);
        setServerError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        // jump back to step 1 if a required field failed
        if (data.fieldErrors?.company_name || data.fieldErrors?.contact_email) setStep(0);
        return;
      }
      track(Events.AUDIT_SUBMITTED, { industry: form.industry, risk: risk.level });
      setDone({ reference: data.reference || "RGA-—" });
    } catch {
      setServerError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  const progressPct = ((step + 1) / TOTAL) * 100;

  return (
    <>
      <div className="audit-bg" aria-hidden="true">
        <canvas id="hero-canvas" />
        <CanvasScript src="/canvas/hero.js" />
        <div className="audit-veil" />
      </div>

      <nav className="audit-nav" aria-label="Audit">
        <div className="wrap">
          <Link className="back" href="/">
            <span style={{ color: "var(--ink)" }}><Logo height={18} /></span>
            <span>← Resurrection Tech™</span>
          </Link>
          <span className="secure"><span className="d" /> Encrypted intake · Confidential</span>
        </div>
      </nav>

      <main className="audit-shell">
        <div className="audit-card">
          {!done ? (
            <div id="workflow">
              <div className="audit-head">
                <span className="eyebrow">Runtime Governance intake</span>
                <h1>48-Hour Runtime Governance Audit™</h1>
                <p className="sub">Identify reachable Ω exposure before deployment.</p>
                <p className="desc">
                  // The audit evaluates executable trajectories, tool interactions, autonomy
                  boundaries, and operational risk before incidents occur.
                </p>
              </div>

              <div className="progress">
                <div className="progress-bar"><i style={{ width: `${progressPct}%` }} /></div>
                <div className="progress-steps">
                  {["Organisation", "System", "Risk profile", "Scope"].map((lbl, i) => (
                    <div
                      key={lbl}
                      className={`ps${i === step ? " active" : ""}${i < step ? " done" : ""}`}
                    >
                      <span className="n">{i + 1}</span>
                      <span className="lbl">{lbl}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="steps">
                {/* STEP 1 */}
                {step === 0 && (
                  <section className="step active">
                    <div className="step-title">Step 01</div>
                    <h2>Organisation</h2>
                    <div className="field-grid">
                      <div className={`field full${errors.company_name ? " err" : ""}`}>
                        <label>Company name <span className="req">*</span></label>
                        <input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="Acme Capital Ltd" autoComplete="organization" />
                        <span className="errmsg">{errors.company_name}</span>
                      </div>
                      <div className="field">
                        <label>Industry</label>
                        <select value={form.industry} onChange={(e) => changeIndustry(e.target.value)}>
                          <option value="">Select industry…</option>
                          {INDUSTRIES.map((i) => <option key={i.id}>{i.label}</option>)}
                          <option>Other</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Website</label>
                        <input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" autoComplete="url" />
                      </div>
                      <div className="field">
                        <label>Team size</label>
                        <select value={form.team_size} onChange={(e) => set("team_size", e.target.value)}>
                          <option value="">Select…</option>
                          {TEAM_SIZES.map((t) => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className={`field${errors.contact_name ? " err" : ""}`}>
                        <label>Primary contact <span className="req">*</span></label>
                        <input value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} placeholder="Full name" autoComplete="name" />
                        <span className="errmsg">{errors.contact_name}</span>
                      </div>
                      <div className={`field${errors.contact_email ? " err" : ""}`}>
                        <label>Email <span className="req">*</span></label>
                        <input type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} placeholder="name@company.com" autoComplete="email" />
                        <span className="errmsg">{errors.contact_email}</span>
                      </div>
                      <div className="field full">
                        <label>Direct line <span style={{ color: "var(--ink-4)" }}>(optional)</span></label>
                        <input value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} placeholder="+44…" autoComplete="tel" />
                      </div>
                    </div>
                    {/* Honeypot — visually hidden, off-screen */}
                    <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 0, overflow: "hidden" }}>
                      <label>Do not fill<input tabIndex={-1} autoComplete="off" value={honey} onChange={(e) => setHoney(e.target.value)} /></label>
                    </div>
                  </section>
                )}

                {/* STEP 2 */}
                {step === 1 && (
                  <section className="step active">
                    <div className="step-title">Step 02</div>
                    <h2>System overview</h2>
                    <div className="field-grid">
                      <div className="field">
                        <label>Agent platform</label>
                        <input value={form.agent_platform} onChange={(e) => set("agent_platform", e.target.value)} placeholder="e.g. internal orchestrator, LangGraph" />
                      </div>
                      <div className="field">
                        <label>Models used</label>
                        <input value={form.models_used} onChange={(e) => set("models_used", e.target.value)} placeholder="e.g. frontier LLMs, in-house planners" />
                      </div>
                    </div>
                    <div className="subfield">
                      <div className="lab">Autonomous capabilities — select all that apply</div>
                      <div className="chips">
                        {SYSTEM_TYPES.map((t) => {
                          const on = form.ai_system_type.includes(t);
                          return (
                            <button type="button" key={t} className={`chip${on ? " on" : ""}`} onClick={() => toggleArray("ai_system_type", t)}>
                              {t}<span className="tick">✓</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="subfield">
                      <div className="lab">Production status</div>
                      <div className="radios">
                        {STATUS.map((s) => (
                          <button type="button" key={s} className={`radio${form.deployment_type === s ? " on" : ""}`} onClick={() => set("deployment_type", s)}>
                            <span className="dot" />{s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>
                )}

                {/* STEP 3 */}
                {step === 2 && (
                  <section className="step active">
                    <div className="step-title">Step 03</div>
                    <h2>Risk profile</h2>
                    <div className="subfield" style={{ marginTop: 0 }}>
                      <div className="lab">
                        {form.industry ? `${form.industry} — capability exposure` : "What can the system reach or execute?"}
                      </div>
                      <div className="checklist">
                        {caps.map((c) => {
                          const on = form.risk_capabilities.includes(c.id);
                          return (
                            <button type="button" key={c.id} className={`check${on ? " on" : ""}${c.critical ? " crit" : ""}`} onClick={() => toggleArray("risk_capabilities", c.id)}>
                              <span className="box"><Tick /></span>{c.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="riskmeter">
                      <div className="rm-top">
                        <span className="rm-lab">{exposureLabel}</span>
                        <span className="rm-level" style={{ color: LEVEL_COLOR[risk.level], transition: "color .4s" }}>
                          {risk.level} Exposure
                        </span>
                      </div>
                      <div className="rm-track">
                        {[0, 1, 2, 3].map((i) => (
                          <div key={i} className={`rm-seg${i <= risk.index ? " " + SEG_CLASS[i] : ""}`} />
                        ))}
                      </div>
                      <div className="rm-scale"><span>Low</span><span>Medium</span><span>High</span><span>Critical</span></div>
                      <div className="rm-note">{risk.note}</div>
                    </div>
                  </section>
                )}

                {/* STEP 4 */}
                {step === 3 && (
                  <section className="step active">
                    <div className="step-title">Step 04</div>
                    <h2>Audit scope &amp; recommendation</h2>

                    {/* Live recommendation summary */}
                    <div className="reco">
                      <div className="reco-grid">
                        <RecoRow k="Organisation" v={form.company_name || "—"} />
                        <RecoRow k="Industry" v={form.industry || "General"} />
                        <RecoRow k="Autonomy level" v={autonomy} />
                        <RecoRow k="Risk surface" v={`${risk.level} Exposure`} color={LEVEL_COLOR[risk.level]} />
                      </div>
                      {form.risk_capabilities.length > 0 && (
                        <div className="reco-exposures">
                          <div className="lab">Primary exposure areas</div>
                          <ul>
                            {caps.filter((c) => form.risk_capabilities.includes(c.id)).map((c) => (
                              <li key={c.id}><span className="ck"><CheckBig /></span>{c.label}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Executive assessment */}
                    <div className="exec-card">
                      <div className="exec-h">Preliminary Governance Assessment</div>
                      <p>{execText(risk.level)}</p>
                    </div>

                    <div className="scope-grid">
                      <div className="deliverables">
                        <div className="dh">Recommended engagement · deliverables</div>
                        <ul>
                          {[
                            "Reachable trajectory analysis",
                            "Ω exposure assessment",
                            "Permit / block partition review",
                            "Runtime governance recommendations",
                            "Executive risk summary",
                            "Integration roadmap",
                          ].map((d) => (
                            <li key={d} className="in"><span className="ck"><CheckBig /></span>{d}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="scope-side">
                        <div className="scope-stat"><div className="k">Engagement</div><div className="v" style={{ fontSize: 16 }}>48-Hour Runtime Governance Audit™</div></div>
                        <div className="scope-stat"><div className="k">Timeline</div><div className="v">48 hours</div></div>
                        <div className="scope-stat accent"><div className="k">Estimated investment</div><div className="v">{investment}</div></div>
                      </div>
                    </div>
                    <PricingDisclaimer variant="short" />
                  </section>
                )}
              </div>

              {serverError && (
                <div className="wrap" style={{ padding: "0 clamp(28px,5vw,48px)" }}>
                  <p className="mono" style={{ color: "var(--omega)", fontSize: 13 }}>{serverError}</p>
                </div>
              )}

              <div className="step-foot">
                <span className="stepcount">Step {String(step + 1).padStart(2, "0")} / {String(TOTAL).padStart(2, "0")}</span>
                <div className="grp">
                  <button className="btn btn--ghost" onClick={back} disabled={step === 0 || submitting}>Back</button>
                  <button className="btn btn--primary" onClick={next} disabled={submitting}>
                    {submitting ? "Submitting…" : step === TOTAL - 1 ? "Request Runtime Governance Audit" : "Continue"} <span className="arr">→</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <ConfirmScreen reference={done.reference} />
          )}
        </div>
      </main>
    </>
  );
}

function RecoRow({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="reco-row">
      <span className="rk">{k}</span>
      <span className="rv" style={color ? { color } : undefined}>{v}</span>
    </div>
  );
}

function execText(level: RiskLevel): string {
  if (level === "Critical")
    return "Based on the submitted information, this environment combines autonomous actions, regulated or high-consequence data, and production execution capabilities. Multiple executable pathways are capable of producing operational, regulatory, financial, or safety consequences. A Runtime Governance Audit is strongly recommended before any deployment expansion.";
  if (level === "High")
    return "Based on the submitted information, this environment contains multiple executable pathways capable of producing operational, regulatory, or financial consequences. A Runtime Governance Audit is recommended before deployment expansion.";
  if (level === "Medium")
    return "Based on the submitted information, this environment contains operationally significant executable pathways. Boundary partitioning and a Runtime Governance Audit are advised ahead of broader rollout.";
  return "Based on the submitted information, the current exposure surface is limited. A baseline Runtime Governance Audit will establish reachable-state coverage before capabilities expand.";
}

function ConfirmScreen({ reference }: { reference: string }) {
  return (
    <div className="confirm active">
      <div className="audit-head" style={{ padding: 0, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20, color: "var(--ink)" }}>
          <Logo height={30} />
        </div>
      </div>
      <div className="seal">
        <svg viewBox="0 0 88 88">
          <circle className="ring" cx="44" cy="44" r="42" />
          <path className="tick" d="M28 45 L40 57 L62 32" />
        </svg>
      </div>
      <h2>Audit Request Received™</h2>
      <p className="lead">Your organisation has entered the Runtime Governance assessment process.</p>
      <div className="nextsteps">
        <div className="ns-h">Next steps</div>
        <ol>
          <li><span className="ns-n">1</span> Architecture review</li>
          <li><span className="ns-n">2</span> Scope confirmation</li>
          <li><span className="ns-n">3</span> Governance assessment scheduling</li>
        </ol>
      </div>
      <div className="cf-grid">
        <div className="cf"><div className="k">Expected response</div><div className="v">1–3 business days.</div></div>
        <div className="cf"><div className="k">Reference</div><div className="v mono">{reference}</div></div>
      </div>
      <p style={{ color: "var(--ink-3)", margin: "26px auto 0", maxWidth: "48ch", fontSize: 14 }}>
        A member of Resurrection Tech will review your submission and determine audit suitability.
      </p>
      <div style={{ marginTop: 30 }}>
        <Link href="/" className="btn btn--ghost">Return to site</Link>
      </div>
    </div>
  );
}
