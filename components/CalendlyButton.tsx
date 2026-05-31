"use client";

import { CALENDLY_PENDING } from "@/lib/booking";
import { track } from "@/lib/analytics";

declare global {
  interface Window {
    Calendly?: {
      initPopupWidget: (opts: { url: string }) => void;
    };
  }
}

/**
 * Opens a Calendly scheduling flow. Uses the official popup widget when the
 * Calendly script has loaded; otherwise falls back to opening the link in a
 * new tab — so it works even if the external script is blocked.
 *
 * When no URL is configured, renders a non-actionable "pending" state instead
 * of a dead link.
 */
export function CalendlyButton({
  url,
  label,
  source,
  className = "btn btn--primary",
}: {
  url: string;
  label: string;
  source: string;
  className?: string;
}) {
  if (!url) {
    return (
      <span className="cal-pending" role="status">
        <span className="cal-pending-dot" aria-hidden="true" />
        {CALENDLY_PENDING}
      </span>
    );
  }

  function open() {
    track("calendly_open", { source });
    if (typeof window !== "undefined" && window.Calendly?.initPopupWidget) {
      window.Calendly.initPopupWidget({ url });
    } else if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <button type="button" className={className} onClick={open}>
      {label} <span className="arr" aria-hidden="true">→</span>
    </button>
  );
}
