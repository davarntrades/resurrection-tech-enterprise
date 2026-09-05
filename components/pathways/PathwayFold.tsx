"use client";

import { useEffect, useRef } from "react";

/* ============================================================
   A collapsible detail section on Enterprise Pathways.

   The page carries the whole commercial model, which makes it long
   enough that a buyer scrolling for "which one am I?" has to travel
   through every product deep-dive to find out. The lifecycle, the
   situation chooser and the closing call stay open; everything else
   folds, so the page reads as a short index that expands on demand.

   Nothing is removed: the content stays in the DOM, so it is still
   indexed, still findable with in-page search, and still reachable by
   its existing anchor. Anchors are the reason for the effect below —
   the site links to #enterprise-assessment, #discovery-workshop and
   friends from the chooser and from other pages, and a link into a
   closed <details> would otherwise land on a heading with the answer
   hidden underneath it.
   ============================================================ */

export function PathwayFold({
  id,
  eyebrow,
  title,
  blurb,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const reveal = () => {
      const el = ref.current;
      if (!el) return;
      el.open = true;
      // The fold has just grown, so let layout settle before scrolling —
      // otherwise the browser aims at the pre-expansion position.
      requestAnimationFrame(() => {
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      });
    };
    const onHash = () => {
      if (decodeURIComponent(window.location.hash) === `#${id}`) reveal();
    };

    // A same-page <Link> navigates with pushState, which does not fire
    // hashchange — so an in-page link to a fold (the situation chooser links to
    // four of them) would scroll to a closed summary with the answer hidden
    // underneath. Catch the click as well as the hash.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (href === `#${id}` || href.endsWith(`#${id}`)) reveal();
    };

    onHash();
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick, true);
    };
  }, [id]);

  return (
    <details className="pw-fold" id={id} ref={ref}>
      <summary>
        <span className="pw-fold-text">
          <span className="pw-fold-eyebrow">{eyebrow}</span>
          <span className="pw-fold-h">{title}</span>
          {blurb && <span className="pw-fold-blurb">{blurb}</span>}
        </span>
        <span className="pw-fold-cue" aria-hidden="true" />
      </summary>
      <div className="pw-fold-body">{children}</div>
    </details>
  );
}
