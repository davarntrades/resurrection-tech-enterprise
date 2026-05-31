"use client";

import { useId, useState } from "react";
import { USE_CASES } from "@/lib/leadValidation";
import { track } from "@/lib/analytics";
import type { LeadSubmitResponse } from "@/lib/types";

interface LeadState {
  name: string;
  organisation: string;
  email: string;
  role: string;
  use_case: string;
  message: string;
}

const EMPTY: LeadState = {
  name: "",
  organisation: "",
  email: "",
  role: "",
  use_case: "",
  message: "",
};

export function LeadForm() {
  const uid = useId();
  const [form, setForm] = useState<LeadState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [done, setDone] = useState<{ reference: string } | null>(null);
  const [honey, setHoney] = useState("");

  function set<K extends keyof LeadState>(key: K, value: LeadState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Required.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()))
      e.email = "Enter a valid email.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    if (!validate()) return;
    setSubmitting(true);
    setServerError("");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source: "book_lead_form", company_url_confirm: honey }),
      });
      const data: LeadSubmitResponse = await res.json();
      if (!res.ok || !data.ok) {
        if (data.fieldErrors) setErrors(data.fieldErrors);
        setServerError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      track("lead_submitted", { use_case: form.use_case || "unspecified" });
      setDone({ reference: data.reference || "LEAD-—" });
    } catch {
      setServerError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="lead-done" role="status">
        <div className="lead-done-seal" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="48" height="48">
            <circle cx="32" cy="32" r="30" fill="none" stroke="var(--ok)" strokeWidth="2" opacity="0.5" />
            <path d="M20 33 L29 42 L45 24" fill="none" stroke="var(--ok)" strokeWidth="2.4" />
          </svg>
        </div>
        <h3>Message received</h3>
        <p>
          Thank you — a member of Resurrection Tech will be in touch. You can also
          book a time directly using the cards above.
        </p>
        <p className="lead-done-ref">
          Reference <span className="mono">{done.reference}</span>
        </p>
      </div>
    );
  }

  return (
    <form className="lead-form" onSubmit={submit} noValidate>
      <div className="lead-grid">
        <Field id={`${uid}-name`} label="Name" required error={errors.name}>
          <input
            id={`${uid}-name`}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            autoComplete="name"
            placeholder="Full name"
            aria-invalid={!!errors.name}
            required
          />
        </Field>
        <Field id={`${uid}-org`} label="Organisation" error={errors.organisation}>
          <input
            id={`${uid}-org`}
            value={form.organisation}
            onChange={(e) => set("organisation", e.target.value)}
            autoComplete="organization"
            placeholder="Company / institution"
          />
        </Field>
        <Field id={`${uid}-email`} label="Email" required error={errors.email}>
          <input
            id={`${uid}-email`}
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            autoComplete="email"
            placeholder="name@organisation.com"
            aria-invalid={!!errors.email}
            required
          />
        </Field>
        <Field id={`${uid}-role`} label="Role" error={errors.role}>
          <input
            id={`${uid}-role`}
            value={form.role}
            onChange={(e) => set("role", e.target.value)}
            autoComplete="organization-title"
            placeholder="e.g. Head of AI, CISO, Investor"
          />
        </Field>
        <Field id={`${uid}-use`} label="Use case" className="lead-full" error={errors.use_case}>
          <select
            id={`${uid}-use`}
            value={form.use_case}
            onChange={(e) => set("use_case", e.target.value)}
          >
            <option value="">Select…</option>
            {USE_CASES.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </Field>
        <Field id={`${uid}-msg`} label="Message" className="lead-full" error={errors.message}>
          <textarea
            id={`${uid}-msg`}
            value={form.message}
            onChange={(e) => set("message", e.target.value)}
            rows={4}
            placeholder="Tell us about your systems, timelines, or what you'd like to discuss."
          />
        </Field>
      </div>

      {/* Honeypot — visually hidden */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 0, overflow: "hidden" }}>
        <label>
          Do not fill
          <input tabIndex={-1} autoComplete="off" value={honey} onChange={(e) => setHoney(e.target.value)} />
        </label>
      </div>

      {serverError && (
        <p className="lead-error mono" role="alert">
          {serverError}
        </p>
      )}

      <div className="lead-foot">
        <p className="lead-note">
          We use your details only to respond. No newsletters, no third-party sharing.
        </p>
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? "Sending…" : "Send message"} <span className="arr" aria-hidden="true">→</span>
        </button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  required,
  error,
  className = "",
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`lead-field${error ? " err" : ""} ${className}`}>
      <label htmlFor={id}>
        {label} {required && <span className="req" aria-hidden="true">*</span>}
      </label>
      {children}
      {error && <span className="lead-errmsg" role="alert">{error}</span>}
    </div>
  );
}
