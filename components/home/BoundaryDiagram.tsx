"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The signature diagram: a bounded state space, a configured forbidden region
 * Ω, and two proposed trajectories.
 *
 * One is authorized and reaches an execution node. The other is terminated at
 * the boundary ∂E — the line stops, and the execution node on that path is
 * never drawn. The motion exists only to show that: nothing decorative moves.
 *
 * Every element carries a text label as well as a colour, and the whole figure
 * has a text description for assistive technology.
 */
export function BoundaryDiagram({ className = "" }: { className?: string }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [drawn, setDrawn] = useState(false);

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
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <figure className={`bdg ${className}`}>
      <svg
        ref={ref}
        className={`bdg-svg rt-draw${drawn ? " in" : ""}`}
        viewBox="0 0 620 400"
        role="img"
        aria-labelledby="bdg-title bdg-desc"
        preserveAspectRatio="xMidYMid meet"
      >
        <title id="bdg-title">
          Admissible Operating Envelope with a permitted and a blocked trajectory
        </title>
        <desc id="bdg-desc">
          A bounded state space contains a configured forbidden region, Omega. One proposed
          trajectory stays inside the envelope and reaches execution. A second proposed
          trajectory is terminated at the envelope boundary and never reaches execution.
        </desc>

        {/* Envelope boundary ∂E */}
        <rect
          x="18" y="18" width="584" height="364"
          fill="none" stroke="var(--line-2)" strokeWidth="1"
          strokeDasharray="0" style={{ strokeDasharray: "none", strokeDashoffset: 0 }}
        />

        {/* Forbidden region Ω */}
        <g className="bdg-omega">
          <rect x="404" y="52" width="170" height="150" fill="var(--omega-dim)" />
          <rect
            x="404" y="52" width="170" height="150"
            fill="none" stroke="var(--omega)" strokeWidth="1" strokeDasharray="4 4"
            style={{ strokeDashoffset: 0 }}
          />
          <text x="489" y="122" className="bdg-omega-glyph" textAnchor="middle">Ω</text>
          <text x="489" y="146" className="bdg-tick" textAnchor="middle">FORBIDDEN REGION</text>
        </g>

        {/* Authorized trajectory — reaches execution */}
        <polyline
          className="bdg-line bdg-line--allow rt-draw-d1"
          style={{ ["--dash" as string]: 520 }}  /* path ≈ 406 */
          points="70,318 168,300 262,268 348,286 466,300"
          fill="none" stroke="var(--accent)" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round"
        />

        {/* Proposed trajectory that would enter Ω — terminated at ∂E */}
        <polyline
          className="bdg-line bdg-line--block rt-draw-d2"
          style={{ ["--dash" as string]: 460 }}  /* path ≈ 388 */
          points="70,318 152,238 244,178 336,140 398,124"
          fill="none" stroke="var(--omega)" strokeWidth="1.6"
          strokeDasharray="5 5"
          strokeLinecap="round" strokeLinejoin="round"
        />

        {/* Authorization boundary the blocked path terminates against */}
        <line
          className="bdg-boundary rt-draw-d1"
          style={{ ["--dash" as string]: 180 }}
          x1="404" y1="34" x2="404" y2="214"
          stroke="var(--omega)" strokeWidth="1.4"
        />

        <g className="rt-fade">
          <text x="404" y="26" className="bdg-tick" textAnchor="middle">∂E</text>

          {/* Termination mark */}
          <g transform="translate(398,124)">
            <line x1="-7" y1="-7" x2="7" y2="7" stroke="var(--omega)" strokeWidth="1.6" />
            <line x1="-7" y1="7" x2="7" y2="-7" stroke="var(--omega)" strokeWidth="1.6" />
          </g>
          <text x="382" y="104" className="bdg-label bdg-label--block" textAnchor="end">
            NOT AUTHORIZED
          </text>
          <text x="382" y="88" className="bdg-tick" textAnchor="end">
            EXECUTION DENIED
          </text>

          {/* Execution node on the authorized path */}
          <circle cx="466" cy="300" r="5" fill="var(--accent)" />
          <circle cx="466" cy="300" r="11" fill="none" stroke="var(--accent)" strokeWidth="1" opacity="0.45" />
          <text x="466" y="272" className="bdg-label bdg-label--allow" textAnchor="middle">AUTHORIZED</text>
          <text x="466" y="256" className="bdg-tick" textAnchor="middle">EXECUTION COMMITTED</text>

          {/* Origin */}
          <circle cx="70" cy="318" r="4" fill="var(--ink)" />
          <text x="70" y="344" className="bdg-tick" textAnchor="middle">x(t₀)</text>
        </g>
      </svg>

      <figcaption className="bdg-legend">
        <span className="bdg-key bdg-key--allow">
          <span className="bdg-swatch" aria-hidden="true" />
          Permitted transition — reaches execution
        </span>
        <span className="bdg-key bdg-key--block">
          <span className="bdg-swatch" aria-hidden="true" />
          Proposed transition — terminated at the boundary
        </span>
        <span className="bdg-key bdg-key--omega">
          <span className="bdg-swatch" aria-hidden="true" />
          Ω — configured forbidden region
        </span>
      </figcaption>
    </figure>
  );
}
