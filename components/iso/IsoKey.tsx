"use client";

/* ============================================================
   Legend key.

   Lives outside the SVG, and carries the same four semantic tones
   and the same marks the drawing uses — a line, a stop cross, a
   hatch swatch, a boundary plane — so nothing in a figure is
   distinguished by colour alone.
   ============================================================ */

import type { Tone } from "./primitives";

const stroke: Record<Tone, string> = {
  neutral: "var(--iso-line-strong)",
  accent: "var(--iso-accent)",
  omega: "var(--iso-omega)",
  ok: "var(--iso-ok)",
};

export type KeyShape = "line" | "dashed" | "stop" | "hatch" | "dots" | "plane" | "node" | "evidence";

export function IsoKey({ tone, shape, label }: { tone: Tone; shape: KeyShape; label: string }) {
  const s = stroke[tone];
  return (
    <span className="iso-key">
      <svg className="iso-key-mark" viewBox="0 0 16 10" aria-hidden="true">
        {shape === "line" && <line x1="0" y1="5" x2="16" y2="5" stroke={s} strokeWidth="1.5" strokeLinecap="round" />}
        {shape === "dashed" && (
          <line x1="0" y1="5" x2="16" y2="5" stroke={s} strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
        )}
        {shape === "stop" && (
          <>
            <line x1="0" y1="5" x2="9" y2="5" stroke={s} strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
            <line x1="10" y1="2" x2="16" y2="8" stroke={s} strokeWidth="1.5" strokeLinecap="round" />
            <line x1="10" y1="8" x2="16" y2="2" stroke={s} strokeWidth="1.5" strokeLinecap="round" />
          </>
        )}
        {shape === "hatch" && (
          <>
            <rect x="0.5" y="0.5" width="15" height="9" fill="none" stroke={s} strokeWidth="1" strokeDasharray="3 2" />
            <path d="M2 9 L6 1 M6 9 L10 1 M10 9 L14 1" stroke={s} strokeWidth="1" opacity="0.6" />
          </>
        )}
        {shape === "dots" && (
          <>
            <rect x="0.5" y="0.5" width="15" height="9" fill="none" stroke={s} strokeWidth="1" strokeDasharray="3 2" />
            <g fill={s} opacity="0.6">
              <circle cx="4" cy="3.5" r="1" /><circle cx="8" cy="6.5" r="1" /><circle cx="12" cy="3.5" r="1" />
            </g>
          </>
        )}
        {shape === "plane" && (
          <>
            <path d="M2 9 L2 1 L14 1 L14 9" fill="none" stroke={s} strokeWidth="1.5" />
            <line x1="8" y1="1" x2="8" y2="9" stroke={s} strokeWidth="1" opacity="0.5" />
          </>
        )}
        {shape === "node" && (
          <>
            <circle cx="8" cy="5" r="4" fill="none" stroke={s} strokeWidth="1" opacity="0.5" />
            <circle cx="8" cy="5" r="2" fill={s} />
          </>
        )}
        {shape === "evidence" && (
          <>
            <rect x="3" y="0.5" width="9" height="9" fill="none" stroke={s} strokeWidth="1.5" />
            <path d="M5.4 5 L7 6.6 L10 3.4" fill="none" stroke={s} strokeWidth="1.5" strokeLinecap="round" />
          </>
        )}
      </svg>
      {label}
    </span>
  );
}
