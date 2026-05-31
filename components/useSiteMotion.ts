"use client";

import { useEffect } from "react";

/**
 * Re-implements the approved scroll interactions as a single effect:
 *  - .reveal → .in on intersection
 *  - [data-count] count-up with locale formatting
 *  - .flow-track staged "lit" sequencing
 *  - .metric bar fill + .deliverables / .vs-col / .callout staggers
 *  - .tbl-row reveal
 * Honors prefers-reduced-motion. Safe to mount on every page; it only
 * acts on elements that exist.
 */
export function useSiteMotion() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---- reveal ----
    const revs = document.querySelectorAll<HTMLElement>(".reveal");
    if (reduced) {
      revs.forEach((r) => r.classList.add("in"));
    } else {
      const ro = new IntersectionObserver(
        (es) => {
          es.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("in");
              ro.unobserve(e.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
      );
      revs.forEach((r) => ro.observe(r));
    }

    // ---- count-up ----
    function animateCount(el: HTMLElement) {
      const target = parseFloat(el.dataset.count || "0");
      const dur = 1500;
      const suffix = el.dataset.suffix || "";
      const prefix = el.dataset.prefix || "";
      const dec = el.dataset.dec ? parseInt(el.dataset.dec) : 0;
      const fmt = (v: number) =>
        parseFloat(v.toFixed(dec)).toLocaleString("en-GB", {
          minimumFractionDigits: dec,
          maximumFractionDigits: dec,
        });
      if (reduced) {
        el.textContent = prefix + fmt(target) + suffix;
        return;
      }
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - t0) / dur, 1);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = prefix + fmt(target * e) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    const counters = document.querySelectorAll<HTMLElement>("[data-count]");
    const co = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting) {
            animateCount(e.target as HTMLElement);
            const metric = (e.target as HTMLElement).closest(".metric");
            metric?.classList.add("in");
            co.unobserve(e.target);
          }
        });
      },
      { threshold: 0.5 },
    );
    counters.forEach((c) => co.observe(c));

    // ---- metric bars without counters ----
    const metrics = document.querySelectorAll<HTMLElement>(".metric");
    const mo = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
      { threshold: 0.4 },
    );
    metrics.forEach((m) => mo.observe(m));

    // ---- flow + engage sequencing ----
    const lightTrack = (
      track: Element,
      stageSelector: string,
      arrowSelector: string,
      delay = 420,
    ) => {
      const stages = track.querySelectorAll<HTMLElement>(stageSelector);
      const arrows = track.querySelectorAll<HTMLElement>(arrowSelector);
      const light = () =>
        stages.forEach((s, i) =>
          setTimeout(() => {
            s.classList.add("lit");
            arrows[i]?.classList.add("lit");
          }, i * delay),
        );
      if (reduced) {
        stages.forEach((s) => s.classList.add("lit"));
        arrows.forEach((a) => a.classList.add("lit"));
      } else {
        const fo = new IntersectionObserver(
          (es) =>
            es.forEach((e) => {
              if (e.isIntersecting) {
                light();
                fo.unobserve(e.target);
              }
            }),
          { threshold: 0.3 },
        );
        fo.observe(track);
      }
    };

    const flowTrack = document.querySelector(".flow-track");
    if (flowTrack) lightTrack(flowTrack, ".flow-stage", ".flow-arrow");

    const engageTrack = document.querySelector(".engage-track");
    if (engageTrack) lightTrack(engageTrack, ".engage-stage", ".engage-arrow");

    // ---- generic staggered groups (.vs-col, .callout) ----
    const groups = document.querySelectorAll<HTMLElement>(".vs-col, .callout");
    const go = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
      { threshold: 0.3 },
    );
    groups.forEach((g) => go.observe(g));

    // ---- table rows ----
    document.querySelectorAll<HTMLElement>("[data-rowreveal]").forEach((group) => {
      const rows = group.querySelectorAll<HTMLElement>("tbody tr");
      rows.forEach((r, i) => {
        r.classList.add("tbl-row-rest");
        r.style.transitionDelay = i * 80 + "ms";
      });
      if (reduced) {
        rows.forEach((r) => r.classList.add("in"));
        return;
      }
      const o = new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            if (e.isIntersecting) {
              rows.forEach((r) => r.classList.add("in"));
              o.unobserve(e.target);
            }
          }),
        { threshold: 0.15 },
      );
      o.observe(group);
    });
  }, []);
}
