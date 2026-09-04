"use client";

import { useEffect, useRef, useState } from "react";

/* ============================================================
   Hero — ASCII density field.

   A monospace character grid where each cell picks a glyph from a
   density ramp according to a scalar field. The field is a set of
   radial waves expanding from a single origin.

   The motion carries the thesis rather than decorating it:

     · the origin is x(t₀)
     · each wave is reachability propagating outward through the
       state space
     · a vertical boundary runs down the field; the wave is
       extinguished where it meets it
     · one aperture in that boundary is the execution gate, and the
       only part of the wave that continues is the part aligned
       with it

   So the picture is: capability spreads in every direction, and
   exactly one direction is authorized to continue.

   Canvas 2D, no dependency, no WebGL. The whole field is one
   loop over ~10k cells at 24fps, which is cheaper than the
   three.js scene it replaces and drops ~150KB gzipped from the
   deferred bundle.

   Monochrome: ink on the page ground, alpha driven by density.
   ============================================================ */

/** Smoothstep between two edges, clamped. */
function smooth(x: number, edge0: number, edge1: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1)));
  return t * t * (3 - 2 * t);
}

/** Light to dense. Index is chosen by field value. */
const RAMP = [" ", "·", ":", "-", "=", "+", "x", "X", "#", "8", "@"];

interface Wave {
  /** Seconds at which this wave left the origin. */
  born: number;
}

interface Cell {
  /** Grid column and row. */
  cx: number;
  cy: number;
  /** Distance from the origin, in cell units, corrected for cell aspect. */
  r: number;
  /** Signed horizontal distance from the boundary column. */
  dxBoundary: number;
  /** Vertical distance from the gate centre, in rows. */
  dyGate: number;
}

export function AsciiField() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let cells: Cell[] = [];
    let cols = 0;
    let rows = 0;
    let cellW = 0;
    let cellH = 0;
    let originCx = 0;
    let originCy = 0;
    let boundaryCx = 0;
    let gateCy = 0;
    let gateHalf = 0;
    let maxR = 1;

    let ink = "16,17,20";
    let raf: number | null = null;
    let running = false;
    let disposed = false;
    let waves: Wave[] = [];
    let lastDraw = 0;

    /* The origin sits at the left edge and the boundary well right of the
       type column, so what the reader sees in the open right-hand side is the
       arc of the wave arriving — the crest, not the centre — and then meeting
       the boundary. Placing the origin under the headline instead put the
       densest part of the field behind the type, where the veil erased it. */
    const BOUNDARY_FRAC = 0.70;
    const ORIGIN_FRAC = 0.02;
    const GATE_ROWS = 5;

    function readInk() {
      const cs = getComputedStyle(wrap!);
      ink = cs.getPropertyValue("--ink-rgb").trim() || "16,17,20";
    }

    function layout() {
      const rect = wrap!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));

      // Larger cells on small screens: the glyphs have to stay readable as
      // glyphs, not dissolve into grain.
      const target = w < 620 ? 13 : w < 1100 ? 12 : 11;
      cellW = target * 0.62; // monospace advance is narrower than the em
      cellH = target;
      cols = Math.ceil(w / cellW) + 1;
      rows = Math.ceil(h / cellH) + 1;

      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.font = `${target}px ui-monospace, "Geist Mono", SFMono-Regular, Menlo, monospace`;
      ctx!.textBaseline = "top";

      originCx = Math.round(cols * ORIGIN_FRAC);
      /* Narrow viewports only show the band above the copy, so the origin
         rides higher there and the arc lands inside that band. */
      originCy = Math.round(rows * (w < 860 ? 0.2 : 0.46));
      boundaryCx = Math.round(cols * BOUNDARY_FRAC);
      gateCy = originCy;
      gateHalf = GATE_ROWS;

      // Cell aspect correction so the waves are circles on screen, not ovals.
      const aspect = cellW / cellH;
      cells = [];
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const dx = (cx - originCx) * aspect;
          const dy = cy - originCy;
          cells.push({
            cx,
            cy,
            r: Math.sqrt(dx * dx + dy * dy),
            dxBoundary: cx - boundaryCx,
            dyGate: Math.abs(cy - gateCy),
          });
        }
      }
      maxR = Math.sqrt(cols * aspect * (cols * aspect) + rows * rows);
    }

    /* Field value at a cell: the sum of the travelling wave bands, masked by
       the boundary. Returns 0..1. */
    function fieldAt(c: Cell, t: number): number {
      let v = 0;
      for (let i = 0; i < waves.length; i++) {
        const age = t - waves[i].born;
        if (age < 0) continue;
        const radius = age * 12.0; // cells per second
        const d = c.r - radius;
        // A travelling band: dense at the crest, falling away on both sides.
        const band = Math.exp(-(d * d) / 44);
        if (band < 0.004) continue;
        // Amplitude falls with distance so the field settles rather than
        // filling the frame.
        const decay = Math.max(0, 1 - radius / (maxR * 0.92));
        v += band * decay;
      }
      if (v <= 0) return 0;

      /* The boundary. Left of it the field is untouched. At and beyond it the
         field is extinguished, except through the gate aperture. */
      if (c.dxBoundary >= 0) {
        const throughGate = 1 - smooth(c.dyGate, gateHalf - 1, gateHalf + 2);
        // Even through the gate the field is attenuated: crossing is
        // permitted, not free.
        const past = smooth(c.dxBoundary, 0, 20);
        v *= throughGate * (1 - past * 0.34);
      }
      return Math.min(1, v);
    }

    function draw(t: number) {
      const rect = wrap!.getBoundingClientRect();
      ctx!.clearRect(0, 0, rect.width, rect.height);

      /* Background lattice: the state space itself, at rest. */
      ctx!.fillStyle = `rgba(${ink},0.13)`;
      for (let cy = 2; cy < rows; cy += 4) {
        for (let cx = 2; cx < cols; cx += 6) {
          ctx!.fillText("·", cx * cellW, cy * cellH);
        }
      }

      /* The wave. Cells are grouped by glyph so the fill colour changes once
         per ramp step instead of once per cell. */
      const coords: number[][] = RAMP.map(() => []);
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const v = fieldAt(c, t);
        if (v < 0.06) continue;
        const idx = Math.min(RAMP.length - 1, Math.max(1, Math.round(v * (RAMP.length - 1))));
        coords[idx].push(c.cx * cellW, c.cy * cellH);
      }
      for (let idx = 1; idx < RAMP.length; idx++) {
        const xy = coords[idx];
        if (!xy.length) continue;
        // Denser glyphs are also darker, so density reads twice.
        const alpha = 0.15 + (idx / (RAMP.length - 1)) * 0.66;
        ctx!.fillStyle = `rgba(${ink},${alpha.toFixed(3)})`;
        const g = RAMP[idx];
        for (let k = 0; k < xy.length; k += 2) ctx!.fillText(g, xy[k], xy[k + 1]);
      }

      /* The boundary, drawn as a column of rules with the gate left open. */
      ctx!.fillStyle = `rgba(${ink},0.40)`;
      for (let cy = 0; cy < rows; cy++) {
        if (Math.abs(cy - gateCy) <= gateHalf) continue;
        ctx!.fillText("│", boundaryCx * cellW, cy * cellH);
      }
      /* The gate jambs mark the aperture without colouring it. */
      ctx!.fillStyle = `rgba(${ink},0.55)`;
      ctx!.fillText("┌", boundaryCx * cellW, (gateCy - gateHalf) * cellH);
      ctx!.fillText("└", boundaryCx * cellW, (gateCy + gateHalf) * cellH);

      /* The origin. */
      ctx!.fillStyle = `rgba(${ink},0.55)`;
      ctx!.fillText("+", originCx * cellW, originCy * cellH);
    }

    const t0 = performance.now();

    function spawn(t: number) {
      // One wave every 2.6s, three alive at most.
      /* Spacing × the number kept alive has to exceed the time a crest needs
         to cross the frame, otherwise waves are retired before they reach the
         boundary. Five at 2.6s covers it at 12 cells/second. */
      if (!waves.length || t - waves[waves.length - 1].born > 2.6) {
        waves.push({ born: t });
      }
      if (waves.length > 5) waves.shift();
    }

    function tick(now: number) {
      if (!running || disposed) return;
      const t = (now - t0) / 1000;
      // 24fps is plenty for a character field and a third of the work of 60.
      if (now - lastDraw > 41) {
        lastDraw = now;
        spawn(t);
        draw(t);
      }
      raf = requestAnimationFrame(tick);
    }

    function start() {
      if (running || disposed || reduce) return;
      running = true;
      raf = requestAnimationFrame(tick);
    }
    function stop() {
      running = false;
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
    }

    readInk();
    layout();

    if (reduce) {
      /* One settled frame, no loop: the field is still legible as a field,
         and nothing moves. */
      waves = [{ born: -1.4 }, { born: -4.0 }, { born: -6.6 }, { born: -9.2 }];
      draw(0);
      setReady(true);
      return () => {
        disposed = true;
      };
    }

    setReady(true);

    const ro = new ResizeObserver(() => {
      layout();
      if (!running) draw((performance.now() - t0) / 1000);
    });
    ro.observe(wrap);

    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);

    const io = new IntersectionObserver(
      (es) => es.forEach((e) => (e.isIntersecting && !document.hidden ? start() : stop())),
      { threshold: 0.01 },
    );
    io.observe(wrap);

    return () => {
      disposed = true;
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div className={`af${ready ? " is-ready" : ""}`} ref={wrapRef} aria-hidden="true">
      <canvas className="af-canvas" ref={canvasRef} />
      <div className="af-veil" />
    </div>
  );
}
