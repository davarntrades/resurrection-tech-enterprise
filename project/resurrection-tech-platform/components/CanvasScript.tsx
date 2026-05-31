"use client";

import { useEffect, useRef } from "react";

/**
 * Loads a vanilla canvas script from /public/canvas into the page,
 * scoped to the element with the given id. The scripts are the approved,
 * verbatim animations (hero trajectory field + reachability graph).
 *
 * They self-init on DOMContentLoaded by locating their canvas by id, so we
 * inject them once on mount and let their internal ResizeObserver/IO drive.
 */
export function CanvasScript({ src }: { src: string }) {
  const injected = useRef(false);

  useEffect(() => {
    if (injected.current) return;
    injected.current = true;
    // Re-inject a fresh script on each mount. Each canvas script cancels any
    // prior RAF loop it started (via a window stop-hook) and re-binds to the
    // currently-mounted canvas — correct across client-side navigations and
    // React Strict-Mode remounts, with no duplicate animation loops.
    const prior = document.querySelector<HTMLScriptElement>(
      `script[data-canvas-src="${src}"]`,
    );
    prior?.remove();
    const s = document.createElement("script");
    s.src = `${src}?v=${Date.now()}`;
    s.async = true;
    s.dataset.canvasSrc = src;
    document.body.appendChild(s);
    return () => {
      injected.current = false;
    };
  }, [src]);

  return null;
}
