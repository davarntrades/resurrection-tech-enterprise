"use client";

/* ============================================================
   The signal track that runs beneath a matrix row.

   A single authorization pulse travels the row, left to right,
   passing under each tile in turn. It is the same idea the whole
   site is about — one authority layer, many surfaces — expressed
   as motion rather than decoration, so it is deliberately slow
   and low-contrast.

   Pure SVG + CSS: no canvas, no per-frame JS.
   ============================================================ */

export function SignalTrack({ cells, delay = 0 }: { cells: number; delay?: number }) {
  return (
    <svg
      className="im-track"
      viewBox="0 0 100 4"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <line className="im-track-rail" x1="0" y1="2" x2="100" y2="2" />
      {/* Node marks sit under the centre of each tile. */}
      {Array.from({ length: cells }, (_, i) => {
        const x = ((i + 0.5) / cells) * 100;
        return <circle key={i} className="im-track-node" cx={x} cy="2" r="0.55" />;
      })}
      <line
        className="im-track-pulse"
        x1="0"
        y1="2"
        x2="100"
        y2="2"
        style={{ ["--im-delay" as string]: `${delay}ms` }}
      />
    </svg>
  );
}
