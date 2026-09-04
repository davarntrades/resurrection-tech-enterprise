"use client";

import { createContext, useContext, useEffect, useId, useRef, useState } from "react";

/* ============================================================
   Figure wrapper + shared context.

   Every illustration is one <IsoFigure>. It owns:
     · the viewBox and the world → screen scale (`unit`)
     · the id namespace, so several figures can share a page
       without their pattern ids colliding
     · the draw-in trigger, which is a class on the root rather
       than per-element state — motion is CSS, not React
     · the accessible name and description

   Motion runs once, on entry, and only when the viewer has not
   asked for reduced motion. Under `prefers-reduced-motion` the
   figure mounts fully drawn.
   ============================================================ */

interface IsoCtx {
  /** Pixels per world unit. */
  unit: number;
  /** Namespace for pattern / marker ids inside this figure. */
  ns: string;
}

const Ctx = createContext<IsoCtx>({ unit: 16, ns: "iso" });

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

/**
 * Solve the scale and viewBox from the world box.
 *
 * The projected width of the box depends only on (x − y), and its height on
 * (x + y) and z, so the extremes can be taken directly from the bounds rather
 * than by projecting every corner. Scale comes from the width; the viewBox is
 * then the projected extent plus padding, which is what removes the empty
 * space a hand-written viewBox always leaves around the drawing.
 */
function fit(b: IsoBounds, targetWidth: number, pad: number) {
  const spanX = (b.x[1] - b.y[0]) - (b.x[0] - b.y[1]);
  const unit = targetWidth / (spanX * COS30);

  const minSx = (b.x[0] - b.y[1]) * COS30 * unit;
  const maxSx = (b.x[1] - b.y[0]) * COS30 * unit;
  const minSy = (b.x[0] + b.y[0]) * SIN30 * unit - b.z[1] * unit;
  const maxSy = (b.x[1] + b.y[1]) * SIN30 * unit - b.z[0] * unit;

  const vb = [
    minSx - pad,
    minSy - pad,
    maxSx - minSx + pad * 2,
    maxSy - minSy + pad * 2,
  ].map((n) => Math.round(n * 10) / 10);

  return { unit, viewBox: vb.join(" ") };
}

export function useIso(): IsoCtx {
  return useContext(Ctx);
}

/** Namespaced reference to a def inside the current figure. */
export function useIsoRef(name: string): string {
  const { ns } = useIso();
  return `url(#${ns}-${name})`;
}

/** The world-space box a figure occupies, as [min, max] per axis. */
export interface IsoBounds {
  x: readonly [number, number];
  y: readonly [number, number];
  z: readonly [number, number];
}

export interface IsoFigureProps {
  /** Accessible name — what the illustration shows. */
  title: string;
  /** Longer description for assistive technology. */
  desc: string;
  /** The world box the drawing occupies. The viewBox and the world → screen
   *  scale are both derived from this, so a figure always fills its frame. */
  bounds: IsoBounds;
  /**
   * Target drawing width in SVG user units. The scale is solved so the
   * projected geometry spans this width, which keeps one user unit ≈ one CSS
   * pixel at a full-measure container — so a 12.5px label really renders at
   * 12.5px instead of being scaled to whatever the viewBox happened to be.
   */
  targetWidth?: number;
  /** Margin around the drawing, in user units. */
  pad?: number;
  /** Caption rendered below the figure, outside the SVG. */
  caption?: React.ReactNode;
  /** Legend rows rendered below the figure, outside the SVG. */
  legend?: React.ReactNode;
  className?: string;
  /** Minimum rendered width before the figure scrolls rather than shrinks. */
  minWidth?: number;
  children: React.ReactNode;
}

export function IsoFigure({
  title,
  desc,
  bounds,
  targetWidth = 1060,
  pad = 56,
  caption,
  legend,
  className = "",
  minWidth = 660,
  children,
}: IsoFigureProps) {
  const { unit, viewBox: initialViewBox } = fit(bounds, targetWidth, pad);
  const [viewBox, setViewBox] = useState(initialViewBox);
  const contentRef = useRef<SVGGElement | null>(null);
  const reactId = useId();
  // useId() emits colons, which are not valid in a CSS url(#…) reference.
  const ns = `iso${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const ref = useRef<SVGSVGElement | null>(null);
  const [drawn, setDrawn] = useState(false);

  /*
   * The declared bounds are a world box, and the drawing never fills all eight
   * of its corners — the tall-and-far corner is always empty, which reserved a
   * band of dead space above every figure. Measuring the rendered geometry
   * gives the true extent, including text, so the frame closes onto the
   * drawing. Fonts have to be settled first or the label boxes are measured at
   * fallback metrics.
   */
  useEffect(() => {
    const g = contentRef.current;
    if (!g) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled || !contentRef.current) return;
      try {
        const b = contentRef.current.getBBox();
        if (b.width > 0 && b.height > 0) {
          setViewBox(
            [b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2]
              .map((n) => Math.round(n * 10) / 10)
              .join(" "),
          );
        }
      } catch {
        /* getBBox throws on a detached or display:none subtree — keep the
           bounds-derived viewBox, which is correct if slightly generous. */
      }
    };
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(measure).catch(measure);
    } else {
      measure();
    }
    return () => {
      cancelled = true;
    };
  }, [pad, initialViewBox]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDrawn(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setDrawn(true);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Ctx.Provider value={{ unit, ns }}>
      <figure className={`iso ${className}`}>
        <div className="iso-stage">
          <svg
            ref={ref}
            className={`iso-svg${drawn ? " is-drawn" : ""}`}
            viewBox={viewBox}
            role="img"
            aria-labelledby={`${ns}-t ${ns}-d`}
            preserveAspectRatio="xMidYMid meet"
            style={{ minWidth }}
          >
            <title id={`${ns}-t`}>{title}</title>
            <desc id={`${ns}-d`}>{desc}</desc>
            <IsoDefs ns={ns} />
            <g ref={contentRef}>{children}</g>
          </svg>
        </div>
        <p className="iso-scrollhint" aria-hidden="true">
          <span>↔</span> Scroll the figure
        </p>
        {(legend || caption) && (
          <figcaption className="iso-caption">
            {legend && <div className="iso-legend">{legend}</div>}
            {caption && <p className="iso-note">{caption}</p>}
          </figcaption>
        )}
      </figure>
    </Ctx.Provider>
  );
}

/* ============================================================
   Shared <defs>.

   Region fills are line density, never solid colour: diagonal
   hatching aligned to the isometric axes, and a dot field. Both
   are defined per semantic tone so a region reads as forbidden or
   admissible without a flat colour wash.
   ============================================================ */

const TONES = [
  ["neutral", "var(--iso-line-strong)"],
  ["accent", "var(--iso-accent)"],
  ["omega", "var(--iso-omega)"],
  ["ok", "var(--iso-ok)"],
] as const;

function IsoDefs({ ns }: { ns: string }) {
  return (
    <defs>
      {TONES.map(([tone, stroke]) => (
        <g key={tone}>
          {/* Hatching runs along the 30° axis so it sits in the same
              perspective as the geometry it fills. */}
          <pattern
            id={`${ns}-hatch-${tone}`}
            width="7"
            height="7"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(30)"
          >
            <line x1="0" y1="0" x2="0" y2="7" stroke={stroke} strokeWidth="1" opacity="0.38" />
          </pattern>
          <pattern
            id={`${ns}-hatch-dense-${tone}`}
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(30)"
          >
            <line x1="0" y1="0" x2="0" y2="4" stroke={stroke} strokeWidth="1" opacity="0.42" />
          </pattern>
          <pattern
            id={`${ns}-dots-${tone}`}
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(30)"
          >
            <circle cx="1.4" cy="1.4" r="1" fill={stroke} opacity="0.4" />
          </pattern>
        </g>
      ))}

      {/* Ground grid, drawn on the isometric plane. */}
      <pattern
        id={`${ns}-grid`}
        width="18"
        height="18"
        patternUnits="userSpaceOnUse"
        patternTransform="skewX(-30) scale(1 0.5774)"
      >
        <path
          d="M18 0 V18 M0 18 H18"
          fill="none"
          stroke="var(--iso-line)"
          strokeWidth="1"
        />
      </pattern>

      {/* Direction marker for connectors. Sized in stroke widths so it tracks
          the line weight rather than the zoom level. */}
      <marker
        id={`${ns}-arrow`}
        viewBox="0 0 8 8"
        refX="6.4"
        refY="4"
        markerWidth="5"
        markerHeight="5"
        markerUnits="strokeWidth"
        orient="auto-start-reverse"
      >
        <path d="M1 1 L6.5 4 L1 7" fill="none" stroke="context-stroke" strokeWidth="1.2"
          strokeLinecap="round" strokeLinejoin="round" />
      </marker>
    </defs>
  );
}
