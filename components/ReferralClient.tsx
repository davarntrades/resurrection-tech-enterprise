"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { track, Events } from "@/lib/analytics";
import { SITE } from "@/lib/site";
import { slugifyRef, referralUrl, referralPath } from "@/lib/referral";

export function ReferralClient() {
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);

  const code = useMemo(() => slugifyRef(input), [input]);
  const url = code ? referralUrl(code, SITE.url) : "";

  async function copy() {
    if (!code) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      try {
        const el = linkRef.current;
        if (el) { el.removeAttribute("readonly"); el.focus(); el.select(); ok = document.execCommand("copy"); el.setAttribute("readonly", ""); }
      } catch { ok = false; }
    }
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
    track(Events.CTA_CLICK, { location: "referral", cta: "copy-link", code });
  }

  return (
    <section className="ref" aria-label="Referral link generator">
      <div className="wrap">
        <div className="ref-head">
          <span className="eyebrow">Referral programme</span>
          <h1>Generate your referral link</h1>
          <p className="ref-lede">
            Introduce a company and generate a tracked referral link. Every assessment completed
            through your link is attributed back to your referral code.
          </p>
        </div>

        <div className="ref-card">
          <label className="ref-field">
            <span className="ref-label">Your name or chosen code</span>
            <input
              className="ref-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. John, Bob, or AI Safety Summit"
              maxLength={80}
              aria-describedby="ref-help"
              autoFocus
            />
            <span id="ref-help" className="ref-hint">
              Lowercased and cleaned automatically — letters, numbers and hyphens only.
            </span>
          </label>

          {code ? (
            <div className="ref-out">
              <span className="ref-out-k">Your referral link</span>
              <input
                ref={linkRef}
                className="ref-linkfield"
                readOnly
                value={url}
                aria-label="Your referral link"
                onFocus={(e) => e.currentTarget.select()}
                onClick={(e) => e.currentTarget.select()}
              />
              <div className="ref-actions">
                <button className="btn btn--primary" onClick={copy} type="button">
                  {copied ? "Link copied ✓" : "Copy referral link"}
                </button>
                <a className="btn btn--ghost" href={referralPath(code)} target="_blank" rel="noopener noreferrer">
                  Preview <span className="arr">→</span>
                </a>
              </div>
              <p className="ref-code-note">Referral code: <b>{code}</b></p>
            </div>
          ) : (
            <div className="ref-empty">Enter a name or code above to generate your link.</div>
          )}

          <p className="ref-terms">
            Referral attribution is subject to internal review and agreed commercial terms.
          </p>
        </div>

        <div className="ref-how">
          <span className="ref-how-k">How it works</span>
          <ol>
            <li>Share your link. Each visitor&apos;s assessment is tagged with your referral code.</li>
            <li>We track attribution from first touch through the engagement pathway —
              workshop, audit, pilot, or integration.</li>
            <li>This will grow into a partner portal where you can see the leads and engagements
              your referrals generated.</li>
          </ol>
          <p className="ref-foot">
            Questions about partnering? <Link href="/contact">Get in touch →</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
