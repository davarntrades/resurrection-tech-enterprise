"use client";

import { useState } from "react";

/**
 * Generic copy-to-clipboard button. Uses the async Clipboard API with a
 * document.execCommand fallback for older / non-secure contexts. Purely
 * presentational — no analytics, safe to reuse anywhere.
 */
export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied ✓",
  className = "btn btn--ghost btn--sm",
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!value) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button type="button" className={className} onClick={copy} aria-live="polite">
      {copied ? copiedLabel : label}
    </button>
  );
}
