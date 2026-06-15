"use client";

import { useState } from "react";

/** A labelled, copy-to-clipboard code block for the integration quickstart.
 *  Presentation only — the snippets it renders are the real /v1/evaluate
 *  contract. */
export function CodeSnippet({ label, lang, code }: { label?: string; lang?: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };
  return (
    <figure className="qs-code reveal">
      <figcaption className="qs-code-bar">
        <span className="qs-code-label">{label}</span>
        <span className="qs-code-right">
          {lang && <span className="qs-code-lang">{lang}</span>}
          <button type="button" className="qs-code-copy" onClick={copy} aria-label="Copy code">
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </span>
      </figcaption>
      <pre className="qs-pre"><code>{code}</code></pre>
    </figure>
  );
}
