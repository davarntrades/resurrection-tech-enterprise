"use client";

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
 * When no URL is configured, the CTA stays actionable and routes to the
 * enquiry/contact flow (fallbackHref) instead of embedding a guessed link
 * (which would show Calendly's "URL is not valid" error).
 */
export function CalendlyButton({
  url,
  label,
  source,
  className = "btn btn--primary",
  fallbackHref = "/contact",
}: {
  url: string;
  label: string;
  source: string;
  className?: string;
  fallbackHref?: string;
}) {
  if (!url) {
    return (
      <a
        href={fallbackHref}
        className={className}
        onClick={() => track("calendly_fallback", { source })}
      >
        {label} <span className="arr" aria-hidden="true">→</span>
      </a>
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
