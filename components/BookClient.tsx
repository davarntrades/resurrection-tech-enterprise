"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { CalendlyButton } from "@/components/CalendlyButton";
import { LeadForm } from "@/components/LeadForm";
import { ContactSection } from "@/components/ContactSection";
import {
  BOOKING_SESSIONS,
  WHY_BOOK,
  CALENDLY_URLS,
  type BookingType,
} from "@/lib/booking";

const CalCheck = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8.5 L6.5 12 L13 4" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);

export function BookClient() {
  const [focused, setFocused] = useState<BookingType | null>(null);
  const cardRefs = useRef<Partial<Record<BookingType, HTMLDivElement | null>>>({});

  // Deep-link focus: /book#enterprise or /book?focus=enterprise highlights and
  // scrolls to the matching card and moves focus to its CTA.
  useEffect(() => {
    const ids = BOOKING_SESSIONS.map((s) => s.id) as BookingType[];
    const fromHash = window.location.hash.replace("#", "");
    const fromQuery = new URLSearchParams(window.location.search).get("focus") ?? "";
    const target = (ids.includes(fromHash as BookingType) && (fromHash as BookingType)) ||
      (ids.includes(fromQuery as BookingType) && (fromQuery as BookingType)) ||
      null;
    if (!target) return;
    setFocused(target);
    const card = cardRefs.current[target];
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // Move keyboard focus to the card's CTA for accessibility, without re-scrolling.
    const t = setTimeout(() => {
      const cta = card?.querySelector<HTMLElement>("button, a");
      cta?.focus({ preventScroll: true });
    }, 450);
    return () => clearTimeout(t);
  }, []);

  const anyCalendly = Object.values(CALENDLY_URLS).some(Boolean);

  return (
    <>
      {/* Calendly assets — only loaded when at least one URL is configured. */}
      {anyCalendly && (
        <>
          {/* eslint-disable-next-line @next/next/no-css-tags */}
          <link rel="stylesheet" href="https://assets.calendly.com/assets/external/widget.css" />
          <Script
            src="https://assets.calendly.com/assets/external/widget.js"
            strategy="lazyOnload"
          />
        </>
      )}

      {/* ===== HEADER ===== */}
      <section className="section book-hero" id="book">
        <div className="wrap">
          <div className="section-head reveal in">
            <span className="eyebrow">Book a meeting</span>
            <h1>Book a Runtime Governance Discussion</h1>
            <p>
              Discuss Runtime Governance, enterprise pilots, licensing, audits, research
              collaboration, and deployment pathways.
            </p>
          </div>

          {/* ===== BOOKING CARDS ===== */}
          <div className="book-grid">
            {BOOKING_SESSIONS.map((s, i) => (
              <div
                key={s.id}
                id={s.anchor}
                ref={(el) => {
                  cardRefs.current[s.id] = el;
                }}
                className={`book-card card reveal${focused === s.id ? " is-focused" : ""}`}
                data-d={i > 0 ? String(i) : undefined}
              >
                <div className="book-card-top">
                  <span className="book-dur">{s.duration}</span>
                  {s.id === "strategy" && <span className="book-flag">Enterprise</span>}
                </div>
                <h3 className="book-card-title">{s.title}</h3>
                <p className="book-desc">{s.description}</p>
                <div className="book-aud">
                  <span className="book-aud-lab">{s.audienceLabel}</span>
                  <ul>
                    {s.audience.map((a) => (
                      <li key={a}>
                        <span className="book-aud-ic"><CalCheck /></span>
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="book-card-cta">
                  <CalendlyButton
                    url={s.calendlyUrl}
                    label={s.cta}
                    source={`book_card_${s.id}`}
                    className="btn btn--primary btn--block"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== WHY BOOK (trust panel) ===== */}
      <section className="section section--tight" id="why-book">
        <div className="wrap">
          <div className="book-trust reveal">
            <div className="book-trust-head">
              <span className="eyebrow">Conversion</span>
              <h2>Why book?</h2>
              <p>
                Every conversation is grounded in your actual systems — not a generic sales
                call. Expect a substantive technical discussion.
              </p>
            </div>
            <ul className="book-trust-list">
              {WHY_BOOK.map((w) => (
                <li key={w}>
                  <span className="book-trust-ic"><CalCheck /></span>
                  {w}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ===== CONTACT ROUTING ===== */}
      <ContactSection id="contact" />

      {/* ===== LEAD FORM ===== */}
      <section className="section section--tight" id="enquire">
        <div className="wrap">
          <div className="book-enquire">
            <div className="book-enquire-head">
              <span className="eyebrow">Lead enquiry</span>
              <h2>Or send a message.</h2>
              <p>
                Not ready to book a specific slot? Share a few details and we&rsquo;ll route
                your enquiry to the right team.
              </p>
            </div>
            <div className="book-enquire-form card reveal">
              <LeadForm />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
