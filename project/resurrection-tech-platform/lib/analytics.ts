"use client";

/**
 * Privacy-friendly analytics event helper.
 * Forwards events to Google Analytics 4 (gtag) and/or Plausible if present.
 * No-ops safely when neither is configured.
 */
type EventParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    plausible?: (event: string, opts?: { props?: EventParams }) => void;
  }
}

export function track(event: string, params: EventParams = {}) {
  if (typeof window === "undefined") return;
  try {
    window.gtag?.("event", event, params);
    window.plausible?.(event, { props: params });
  } catch {
    /* analytics must never break UX */
  }
}

export const Events = {
  AUDIT_STARTED: "audit_started",
  AUDIT_STEP: "audit_step_advanced",
  AUDIT_SUBMITTED: "audit_request_submitted",
  CTA_CLICK: "cta_click",
  SCHEDULE_CLICK: "schedule_click",
} as const;
