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

  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    track("calendly_open", { source });
    // If the Calendly widget is loaded, open the in-page popup instead of
    // navigating. Otherwise the anchor's default behaviour opens a new tab —
    // so the link always works, with or without JS.
    if (window.Calendly?.initPopupWidget) {
      e.preventDefault();
      window.Calendly.initPopupWidget({ url });
    }
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={onClick}
    >
      {label} <span className="arr" aria-hidden="true">→</span>
    </a>
  );
}
