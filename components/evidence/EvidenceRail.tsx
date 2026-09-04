"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EvidenceCard } from "./EvidenceCard";
import { EVIDENCE } from "./evidence-data";

/* ============================================================
   Horizontally browsable evidence rail.

   Scroll-snap does the work; JS only adds the affordances the
   native behaviour cannot provide — arrow buttons, a position
   readout, and roving-tabindex keyboard navigation. The rail is
   a list, so a screen reader gets "3 of 6" from the markup
   rather than from a live region hack, and every card stays in
   the tab order regardless of scroll position.
   ============================================================ */

export function EvidenceRail() {
  const railRef = useRef<HTMLUListElement | null>(null);
  const [active, setActive] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  /* Track which card is nearest the rail's left edge, and whether either
     end has been reached, so the controls reflect the real scroll state
     rather than a counter that can drift out of sync with a drag. */
  const sync = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const items = Array.from(rail.children) as HTMLElement[];
    if (!items.length) return;
    const edge = rail.scrollLeft;
    let nearest = 0;
    let best = Infinity;
    items.forEach((el, i) => {
      const d = Math.abs(el.offsetLeft - rail.offsetLeft - edge);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setActive(nearest);
    setAtStart(edge <= 2);
    setAtEnd(edge + rail.clientWidth >= rail.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    sync();
    rail.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      rail.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [sync]);

  const go = useCallback((dir: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    const items = Array.from(rail.children) as HTMLElement[];
    const next = Math.min(Math.max(active + dir, 0), items.length - 1);
    const target = items[next];
    if (!target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollTo({
      left: target.offsetLeft - rail.offsetLeft,
      behavior: reduce ? "auto" : "smooth",
    });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      railRef.current?.scrollTo({ left: 0 });
    } else if (e.key === "End") {
      e.preventDefault();
      railRef.current?.scrollTo({ left: railRef.current.scrollWidth });
    }
  };

  return (
    <div className="ev-rail-wrap">
      <div className="ev-rail-bar">
        <p className="ev-rail-count" aria-hidden="true">
          <span className="ev-rail-n">{String(active + 1).padStart(2, "0")}</span>
          <span className="ev-rail-sep">/</span>
          <span>{String(EVIDENCE.length).padStart(2, "0")}</span>
        </p>
        <div className="ev-rail-controls">
          <button
            type="button"
            className="ev-rail-btn"
            onClick={() => go(-1)}
            disabled={atStart}
            aria-label="Previous evidence record"
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            className="ev-rail-btn"
            onClick={() => go(1)}
            disabled={atEnd}
            aria-label="Next evidence record"
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      <ul
        className="ev-rail"
        ref={railRef}
        onKeyDown={onKeyDown}
        tabIndex={0}
        aria-label="Evidence records — scroll horizontally or use the arrow keys"
      >
        {EVIDENCE.map((record, i) => (
          <li key={record.id} className="ev-rail-item">
            <EvidenceCard record={record} index={i} />
          </li>
        ))}
      </ul>

      {/* Position readout for assistive technology, kept out of the visual
          rail so the count is not duplicated on screen. */}
      <p className="sr-only" aria-live="polite">
        Record {active + 1} of {EVIDENCE.length}
      </p>
    </div>
  );
}
