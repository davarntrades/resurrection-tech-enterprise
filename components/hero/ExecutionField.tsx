"use client";

import { useEffect, useRef, useState } from "react";
import type { FieldHandle, FieldPalette } from "./scene/createExecutionField";

/* ============================================================
   Host for the WebGL execution field.

   Owns every performance guarantee; the scene module owns none:

     · the three.js chunk is imported only after first paint, and
       only once the hero is actually on screen
     · devicePixelRatio is capped at 1.75
     · the point count drops on narrow viewports and on devices
       reporting few cores
     · the loop suspends when the tab is hidden and when the hero
       scrolls out of view
     · prefers-reduced-motion skips the import entirely — the
       static fallback is what renders, and no WebGL context is
       ever created
     · a WebGL failure or a context loss falls back to the same
       static figure rather than leaving an empty frame

   The canvas is decorative: the hero's meaning is in the copy and
   in the static figure, both of which are real DOM.
   ============================================================ */

function readPalette(el: HTMLElement): FieldPalette {
  const cs = getComputedStyle(el);
  const pick = (name: string, fallback: string) =>
    cs.getPropertyValue(name).trim() || fallback;
  return {
    ink: pick("--ink-3", "#616670"),
    accent: pick("--accent", "#123a9e"),
    omega: pick("--omega", "#a81e12"),
    bg: pick("--bg-1", "#fbfaf7"),
  };
}

/** Point budget, scaled to the device rather than fixed. */
function pointBudget(width: number): number {
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
  if (width < 620) return cores <= 4 ? 1400 : 2200;
  if (width < 1100) return cores <= 4 ? 2600 : 4200;
  return cores <= 4 ? 4000 : 6500;
}

export function ExecutionField() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<FieldHandle | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) return; // static figure only; no context created.

    let cancelled = false;
    let onVisibility: (() => void) | null = null;
    let ro: ResizeObserver | null = null;
    let io: IntersectionObserver | null = null;
    let onLost: ((e: Event) => void) | null = null;

    const stop = () => {
      runningRef.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const start = () => {
      if (runningRef.current || !handleRef.current || cancelled) return;
      runningRef.current = true;
      const t0 = performance.now();
      const tick = (now: number) => {
        if (!runningRef.current || !handleRef.current) return;
        handleRef.current.frame((now - t0) / 1000);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const boot = async () => {
      if (cancelled) return;
      let create: typeof import("./scene/createExecutionField").createExecutionField;
      try {
        // The three.js chunk enters the network only at this point.
        ({ createExecutionField: create } = await import("./scene/createExecutionField"));
      } catch {
        return; // Chunk failed: the static figure is already rendered.
      }
      if (cancelled) return;

      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      try {
        handleRef.current = create(canvas, {
          width: Math.max(1, rect.width),
          height: Math.max(1, rect.height),
          dpr,
          pointCount: pointBudget(rect.width),
          palette: readPalette(wrap),
        });
      } catch {
        return; // No WebGL, or context creation refused.
      }
      if (cancelled) {
        handleRef.current.dispose();
        handleRef.current = null;
        return;
      }
      setLive(true);

      ro = new ResizeObserver(() => {
        const r = wrap.getBoundingClientRect();
        handleRef.current?.resize(
          Math.max(1, r.width),
          Math.max(1, r.height),
          Math.min(window.devicePixelRatio || 1, 1.75),
        );
      });
      ro.observe(wrap);

      onVisibility = () => (document.hidden ? stop() : start());
      document.addEventListener("visibilitychange", onVisibility);

      // Suspend once the hero leaves the viewport.
      io = new IntersectionObserver(
        (entries) => entries.forEach((e) => (e.isIntersecting && !document.hidden ? start() : stop())),
        { threshold: 0.01 },
      );
      io.observe(wrap);

      onLost = (e: Event) => {
        e.preventDefault();
        stop();
        setLive(false); // reveal the static figure again
      };
      canvas.addEventListener("webglcontextlost", onLost);

      start();
    };

    /* After first paint, and never on the critical path. */
    type IdleWindow = Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const w = window as IdleWindow;
    const schedule = (cb: () => void): number =>
      typeof w.requestIdleCallback === "function"
        ? w.requestIdleCallback(cb, { timeout: 2200 })
        : window.setTimeout(cb, 320);

    let idleId: number | null = null;
    const gate = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          gate.disconnect();
          idleId = schedule(boot);
        }
      },
      { threshold: 0.01 },
    );
    gate.observe(wrap);

    return () => {
      cancelled = true;
      stop();
      gate.disconnect();
      io?.disconnect();
      ro?.disconnect();
      if (idleId !== null) {
        if (typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(idleId);
        else clearTimeout(idleId);
      }
      if (onVisibility) document.removeEventListener("visibilitychange", onVisibility);
      if (onLost) canvas.removeEventListener("webglcontextlost", onLost);
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, []);

  return (
    <div className={`xf${live ? " is-live" : ""}`} ref={wrapRef} aria-hidden="true">
      <canvas className="xf-canvas" ref={canvasRef} />
      <ExecutionFieldFallback />
      <div className="xf-veil" />
    </div>
  );
}

/* ============================================================
   Static fallback.

   What renders under prefers-reduced-motion, before the chunk
   arrives, and if WebGL is unavailable or the context is lost.
   Same architecture, same semantic colours, no animation: the
   boundary, its gate, Ω, and the two trajectories with one
   terminating at the plane.
   ============================================================ */
function ExecutionFieldFallback() {
  return (
    <svg className="xf-fallback" viewBox="0 0 1200 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {/* Sparse field, laid out on a fixed lattice so it is stable
          between renders and adds no runtime cost. */}
      <g className="xf-fb-field">
        {Array.from({ length: 132 }, (_, i) => {
          const col = i % 22;
          const row = Math.floor(i / 22);
          const x = 40 + col * 53 + ((row % 2) * 26);
          const y = 70 + row * 74 + ((col % 3) * 9);
          const inOmega = x > 800 && x < 1075 && y > 92 && y < 262;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={inOmega ? 1.9 : 1.5}
              className={inOmega ? "xf-fb-dot is-omega" : "xf-fb-dot"}
            />
          );
        })}
      </g>

      {/* Ω */}
      <g className="xf-fb-omega">
        <rect x="800" y="92" width="275" height="170" />
        <text x="937" y="192" textAnchor="middle">Ω</text>
      </g>

      {/* Authorization boundary, with a gate opening */}
      <g className="xf-fb-plane">
        <path d="M640 40 L640 520" />
        <path d="M576 62 L576 498" />
        <path d="M704 62 L704 498" />
        <path d="M512 96 L512 464" />
        <path d="M768 96 L768 464" />
      </g>
      <g className="xf-fb-gate">
        <rect x="612" y="252" width="56" height="96" />
      </g>

      {/* Authorized: crosses the gate, reaches execution */}
      <path className="xf-fb-auth" d="M40 372 C 260 340, 460 312, 640 300 S 1010 268, 1160 250" />
      <circle className="xf-fb-exec" cx="1160" cy="250" r="5" />
      <circle className="xf-fb-exec-ring" cx="1160" cy="250" r="11" />

      {/* Proposed: terminates at the plane, away from the gate */}
      <path className="xf-fb-blocked" d="M40 372 C 240 300, 430 214, 640 178" />
      <g className="xf-fb-stop" transform="translate(640 178)">
        <path d="M-7 -7 L7 7 M-7 7 L7 -7" />
      </g>
    </svg>
  );
}
