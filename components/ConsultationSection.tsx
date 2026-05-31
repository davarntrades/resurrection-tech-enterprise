"use client";

import Script from "next/script";
import { CalendlyButton } from "@/components/CalendlyButton";
import { BOOKING_SESSIONS, CALENDLY_URLS } from "@/lib/booking";

/**
 * Reusable "Book a consultation" section — three Calendly options as premium,
 * responsive cards. Drop it onto any page (home, services, contact). Loads the
 * Calendly popup assets lazily; CalendlyButton falls back to opening the link
 * in a new tab if the script is unavailable, so booking always works.
 */
export function ConsultationSection({
  id = "book-consult",
  eyebrow = "Schedule a call",
  heading = "Book a consultation.",
  blurb = "Choose the conversation that fits — from a 30-minute introduction to a 90-minute enterprise strategy session on AI governance, runtime safety, and reachability-based control.",
}: {
  id?: string;
  eyebrow?: string;
  heading?: string;
  blurb?: string;
}) {
  const anyCalendly = Object.values(CALENDLY_URLS).some(Boolean);

  return (
    <section className="section section--tight" id={id} data-screen-label="Book a consultation">
      {anyCalendly && (
        <>
          {/* eslint-disable-next-line @next/next/no-css-tags */}
          <link rel="stylesheet" href="https://assets.calendly.com/assets/external/widget.css" />
          <Script src="https://assets.calendly.com/assets/external/widget.js" strategy="lazyOnload" />
        </>
      )}
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">{eyebrow}</span>
          <h2>{heading}</h2>
          <p>{blurb}</p>
        </div>
        <div className="book-grid">
          {BOOKING_SESSIONS.map((s, i) => (
            <div
              key={s.id}
              id={`consult-${s.anchor}`}
              className="book-card card reveal"
              data-d={i > 0 ? String(i) : undefined}
            >
              <div className="book-card-top">
                <span className="book-dur">{s.duration}</span>
              </div>
              <h3 className="book-card-title">{s.title}</h3>
              <p className="book-desc">{s.description}</p>
              <div className="book-card-cta">
                <CalendlyButton
                  url={s.calendlyUrl}
                  label={s.cta}
                  source={`consult_${s.id}`}
                  className="btn btn--primary btn--block"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
