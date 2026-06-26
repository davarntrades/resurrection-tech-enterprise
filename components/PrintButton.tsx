"use client";

/** One-click print / save-as-PDF for the current page. */
export function PrintButton({ className = "btn btn--primary", label = "Download / Print PDF" }: { className?: string; label?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      {label} <span className="arr" aria-hidden="true">↓</span>
    </button>
  );
}
