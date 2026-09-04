"use client";

import { useIso } from "./IsoFigure";
import {
  boxLeft,
  boxRight,
  boxTop,
  closedPath,
  path,
  poly,
  project,
  quadXY,
  screenLength,
  type Vec3,
} from "./projection";

/* ============================================================
   Isometric primitives.

   Every one of these shares the projection, the stroke system,
   the pattern definitions and the semantic colour tokens. None
   of them carries a shadow, a glow or a gradient: depth comes
   from geometry and line density.

   Semantic tone is the only use of colour:
     neutral — structure, environment, boundaries
     accent  — authorized transition, committed execution
     omega   — blocked transition, forbidden state
     ok      — verified evidence, validated outcome
   ============================================================ */

export type Tone = "neutral" | "accent" | "omega" | "ok";
export type Fill = "none" | "hatch" | "hatch-dense" | "dots";

const toneVar: Record<Tone, string> = {
  neutral: "var(--iso-ink)",
  accent: "var(--iso-accent)",
  omega: "var(--iso-omega)",
  ok: "var(--iso-ok)",
};

const structureVar: Record<Tone, string> = {
  neutral: "var(--iso-line-strong)",
  accent: "var(--iso-accent)",
  omega: "var(--iso-omega)",
  ok: "var(--iso-ok)",
};

/** Resolve a pattern fill to a namespaced url(), or "none". */
function useFill(fill: Fill, tone: Tone): string {
  const { ns } = useIso();
  if (fill === "none") return "none";
  return `url(#${ns}-${fill}-${tone})`;
}

/* ---------- 1 · IsometricGrid ----------
   The ground the illustration stands on. Deliberately faint: it
   establishes the plane and then gets out of the way. */

export function IsometricGrid({
  x = 0,
  y = 0,
  w = 10,
  d = 10,
  z = 0,
  fade = true,
}: {
  x?: number; y?: number; w?: number; d?: number; z?: number; fade?: boolean;
}) {
  const { unit } = useIso();
  const lines: React.ReactNode[] = [];
  for (let i = 0; i <= w; i++) {
    lines.push(
      <line key={`x${i}`} className="iso-grid-line"
        {...seg([x + i, y, z], [x + i, y + d, z], unit)} />,
    );
  }
  for (let j = 0; j <= d; j++) {
    lines.push(
      <line key={`y${j}`} className="iso-grid-line"
        {...seg([x, y + j, z], [x + w, y + j, z], unit)} />,
    );
  }
  return <g className={`iso-grid${fade ? " is-faded" : ""}`} aria-hidden="true">{lines}</g>;
}

/* ---------- 2 · IsometricPlane ----------
   A flat quad on the ground plane. */

export function IsometricPlane({
  x, y, w, d, z = 0, tone = "neutral", fill = "none", dashed = false, className = "",
}: {
  x: number; y: number; w: number; d: number; z?: number;
  tone?: Tone; fill?: Fill; dashed?: boolean; className?: string;
}) {
  const { unit } = useIso();
  const f = useFill(fill, tone);
  return (
    <polygon
      className={`iso-face${dashed ? " is-dashed" : ""} ${className}`}
      points={poly(quadXY(x, y, w, d, z), unit)}
      fill={f}
      stroke={structureVar[tone]}
    />
  );
}

/* ---------- 3 · HatchedFace / 4 · DottedFace ----------
   An arbitrary quad filled by line density rather than colour. */

export function HatchedFace({
  points, tone = "neutral", dense = false, stroke = true, className = "",
}: {
  points: readonly Vec3[]; tone?: Tone; dense?: boolean; stroke?: boolean; className?: string;
}) {
  const { unit } = useIso();
  const f = useFill(dense ? "hatch-dense" : "hatch", tone);
  return (
    <polygon
      className={`iso-face ${className}`}
      points={poly(points, unit)}
      fill={f}
      stroke={stroke ? structureVar[tone] : "none"}
    />
  );
}

export function DottedFace({
  points, tone = "neutral", stroke = true, className = "",
}: {
  points: readonly Vec3[]; tone?: Tone; stroke?: boolean; className?: string;
}) {
  const { unit } = useIso();
  const f = useFill("dots", tone);
  return (
    <polygon
      className={`iso-face ${className}`}
      points={poly(points, unit)}
      fill={f}
      stroke={stroke ? structureVar[tone] : "none"}
    />
  );
}

/* ---------- 5 · IsometricBox ----------
   Three visible faces, open at the back. The top carries the
   optional pattern; the walls stay transparent so geometry behind
   the box still reads. */

export function IsometricBox({
  at, size, tone = "neutral", fill = "none", className = "",
}: {
  at: Vec3; size: readonly [number, number, number];
  tone?: Tone; fill?: Fill; className?: string;
}) {
  const { unit } = useIso();
  const spec = { at, size };
  const f = useFill(fill, tone);
  const stroke = structureVar[tone];
  return (
    <g className={`iso-box ${className}`}>
      <polygon className="iso-face" points={poly(boxLeft(spec), unit)} fill="none" stroke={stroke} />
      <polygon className="iso-face" points={poly(boxRight(spec), unit)} fill="none" stroke={stroke} />
      <polygon className="iso-face" points={poly(boxTop(spec), unit)} fill={f} stroke={stroke} />
    </g>
  );
}

/* ---------- 6 · BoundaryPlane ----------
   A vertical plane standing on the ground — the architectural
   element the whole system is about. Rendered as a framed plane
   with vertical mullions rather than a filled slab, so it reads
   as a structure and not a wall of colour. */

export function BoundaryPlane({
  at, length, height, axis = "y", tone = "neutral", mullions = 4,
  label, labelAnchor = "start", labelDx = 10, labelDy = -8, labelEnd = "far",
}: {
  at: Vec3; length: number; height: number;
  axis?: "x" | "y"; tone?: Tone; mullions?: number; label?: string;
  labelAnchor?: "start" | "middle" | "end"; labelDx?: number; labelDy?: number;
  /** Which end of the plane the label hangs from. */
  labelEnd?: "near" | "far";
}) {
  const { unit } = useIso();
  const [x, y, z] = at;
  const along = (t: number): Vec3 => (axis === "y" ? [x, y + t, z] : [x + t, y, z]);
  const up = (v: Vec3, h: number): Vec3 => [v[0], v[1], v[2] + h];

  const frame: Vec3[] = [along(0), along(length), up(along(length), height), up(along(0), height)];
  const bars = Array.from({ length: Math.max(0, mullions) }, (_, i) => {
    const t = (length * (i + 1)) / (mullions + 1);
    return { a: along(t), b: up(along(t), height) };
  });

  return (
    <g className="iso-boundary">
      <polygon
        className="iso-face iso-boundary-frame"
        points={poly(frame, unit)}
        fill="none"
        stroke={structureVar[tone]}
      />
      {bars.map((b, i) => (
        <line key={i} className="iso-boundary-mullion" {...seg(b.a, b.b, unit)} stroke={structureVar[tone]} />
      ))}
      {/* Ground trace: where the plane meets the surface. */}
      <line className="iso-boundary-trace" {...seg(along(0), along(length), unit)} stroke={structureVar[tone]} />
      {label && (
        <TechnicalLabel
          at={up(along(labelEnd === "near" ? 0 : length), height)}
          text={label}
          anchor={labelAnchor}
          dx={labelDx}
          dy={labelDy}
          tone={tone}
        />
      )}
    </g>
  );
}

/* ---------- 7 · ExecutionGate ----------
   An opening in a boundary plane. The authorized path passes
   through it; a denied path stops at the plane beside it. */

export function ExecutionGate({
  at, width, height, axis = "y", tone = "accent", open = true, label,
}: {
  at: Vec3; width: number; height: number;
  axis?: "x" | "y"; tone?: Tone; open?: boolean; label?: string;
}) {
  const { unit } = useIso();
  const [x, y, z] = at;
  const along = (t: number): Vec3 => (axis === "y" ? [x, y + t, z] : [x + t, y, z]);
  const jambA = along(0);
  const jambB = along(width);
  const head: Vec3[] = [
    [jambA[0], jambA[1], z + height],
    [jambB[0], jambB[1], z + height],
  ];
  const stroke = structureVar[open ? tone : "omega"];

  return (
    <g className={`iso-gate${open ? " is-open" : " is-closed"}`}>
      <line className="iso-gate-jamb" {...seg(jambA, [jambA[0], jambA[1], z + height], unit)} stroke={stroke} />
      <line className="iso-gate-jamb" {...seg(jambB, [jambB[0], jambB[1], z + height], unit)} stroke={stroke} />
      <line className="iso-gate-head" {...seg(head[0], head[1], unit)} stroke={stroke} />
      {!open && (
        /* A closed gate is barred, not merely recoloured. */
        <line
          className="iso-gate-bar"
          {...seg([jambA[0], jambA[1], z + height * 0.55], [jambB[0], jambB[1], z + height * 0.55], unit)}
          stroke={stroke}
        />
      )}
      {label && (
        <TechnicalLabel at={[jambB[0], jambB[1], z + height]} text={label} anchor="start" dx={9} dy={-7} tone={open ? tone : "omega"} />
      )}
    </g>
  );
}

/* ---------- 8 · ForbiddenRegion ----------
   Ω. A volume marked by hatch density and a dashed silhouette —
   never a solid red block. The glyph sits on the top face so the
   region reads as occupying space, not as a flat shape. */

export function ForbiddenRegion({
  at, size, glyph = "Ω", label,
}: {
  at: Vec3; size: readonly [number, number, number]; glyph?: string; label?: string;
}) {
  const { unit } = useIso();
  const spec = { at, size };
  const [x, y, z] = at;
  const [w, d, h] = size;
  const centreTop: Vec3 = [x + w / 2, y + d / 2, z + h];

  return (
    <g className="iso-omega">
      <HatchedFace points={boxLeft(spec)} tone="omega" className="iso-omega-wall" />
      <HatchedFace points={boxRight(spec)} tone="omega" className="iso-omega-wall" />
      <DottedFace points={boxTop(spec)} tone="omega" className="iso-omega-top" />
      {/* Dashed silhouette on the ground: the region's footprint. */}
      <polygon
        className="iso-face is-dashed iso-omega-foot"
        points={poly(quadXY(x, y, w, d, z), unit)}
        fill="none"
        stroke={structureVar.omega}
      />
      <TechnicalLabel at={centreTop} text={glyph} anchor="middle" dy={4} tone="omega" size="glyph" />
      {/* Below the footprint, so it never sits on the hatching. */}
      {label && (
        <TechnicalLabel at={[x + w / 2, y + d, z]} text={label} anchor="middle" dy={44} tone="omega" />
      )}
    </g>
  );
}

/* ---------- 9 · StateNode ----------
   A state in the space. Ring plus centre so it stays legible at
   mobile sizes, with a short drop line to the ground plane that
   fixes its position in the perspective. */

export function StateNode({
  at, tone = "neutral", label, sublabel, kind = "state", drop = true, anchor = "start", dx = 12, dy = -4, delay = 0,
}: {
  at: Vec3; tone?: Tone; label?: string; sublabel?: string;
  kind?: "state" | "origin" | "terminal"; drop?: boolean;
  anchor?: "start" | "middle" | "end"; dx?: number; dy?: number; delay?: number;
}) {
  const { unit } = useIso();
  const p = project(at, unit);
  const ground = project([at[0], at[1], 0], unit);
  const stroke = structureVar[tone];
  const r = kind === "origin" ? 4.5 : 5.5;

  return (
    <g className="iso-node" style={delay ? { ["--iso-delay" as string]: `${delay}ms` } : undefined}>
      {drop && at[2] > 0 && (
        <line className="iso-node-drop" x1={p.x} y1={p.y} x2={ground.x} y2={ground.y} stroke={stroke} />
      )}
      {kind !== "origin" && (
        <circle className="iso-node-ring" cx={p.x} cy={p.y} r={r + 5} fill="none" stroke={stroke} />
      )}
      <circle className="iso-node-core" cx={p.x} cy={p.y} r={r} fill={toneVar[tone]} stroke="none" />
      {label && <TechnicalLabel at={at} text={label} anchor={anchor} dx={dx} dy={dy} tone={tone} />}
      {sublabel && <TechnicalLabel at={at} text={sublabel} anchor={anchor} dx={dx} dy={dy + 14} tone="neutral" size="micro" />}
    </g>
  );
}

/* ---------- 10 · EvidenceNode ----------
   A verified record. Square rather than round, with a tick, so
   "verified" is carried by shape as well as by tone. */

export function EvidenceNode({
  at, label, sublabel, verified = true, delay = 0,
}: {
  at: Vec3; label?: string; sublabel?: string; verified?: boolean; delay?: number;
}) {
  const { unit } = useIso();
  const p = project(at, unit);
  const tone: Tone = verified ? "ok" : "neutral";
  const s = 6.5;

  return (
    <g className="iso-node iso-evidence" style={delay ? { ["--iso-delay" as string]: `${delay}ms` } : undefined}>
      <rect
        className="iso-evidence-frame"
        x={p.x - s} y={p.y - s} width={s * 2} height={s * 2}
        fill="none" stroke={structureVar[tone]}
      />
      {verified && (
        <path
          className="iso-evidence-tick"
          d={`M${p.x - 3.2},${p.y} L${p.x - 0.8},${p.y + 2.6} L${p.x + 3.4},${p.y - 2.8}`}
          fill="none" stroke={structureVar.ok}
        />
      )}
      {label && <TechnicalLabel at={at} text={label} anchor="middle" dy={-16} tone={tone} />}
      {sublabel && <TechnicalLabel at={at} text={sublabel} anchor="middle" dy={24} tone="neutral" size="micro" />}
    </g>
  );
}

/* ---------- 11 · TrajectoryPath ----------
   A proposed transition through the space. Draws in with
   stroke-dashoffset; a terminated path simply stops where the
   geometry says it stops, and carries a cross at its end. */

export function TrajectoryPath({
  points, tone = "accent", state = "authorized", delay = 0, marker = true, dashed = false,
}: {
  points: readonly Vec3[];
  tone?: Tone;
  state?: "authorized" | "terminated" | "proposed";
  delay?: number;
  marker?: boolean;
  dashed?: boolean;
}) {
  const { unit, ns } = useIso();
  const len = screenLength(points, unit);
  const end = points[points.length - 1];
  const p = project(end, unit);
  const stroke = structureVar[tone];

  return (
    <g className={`iso-traj is-${state}`} style={{ ["--iso-delay" as string]: `${delay}ms` }}>
      <path
        className={`iso-traj-line${dashed ? " is-dashed" : ""}`}
        d={path(points, unit)}
        fill="none"
        stroke={stroke}
        // Padded: an under-estimated dash length leaves the tail undrawn.
        style={{ ["--iso-dash" as string]: `${Math.ceil(len) + 8}` }}
        markerEnd={marker && state === "authorized" ? `url(#${ns}-arrow)` : undefined}
      />
      {state === "terminated" && (
        <g className="iso-traj-stop">
          <line x1={p.x - 6} y1={p.y - 6} x2={p.x + 6} y2={p.y + 6} stroke={structureVar.omega} />
          <line x1={p.x - 6} y1={p.y + 6} x2={p.x + 6} y2={p.y - 6} stroke={structureVar.omega} />
        </g>
      )}
    </g>
  );
}

/* ---------- 12 · Connector ----------
   A structural relation between two points — not a trajectory.
   Thinner, optionally dashed, optionally directed. */

export function Connector({
  from, to, tone = "neutral", dashed = false, directed = false, delay = 0,
}: {
  from: Vec3; to: Vec3; tone?: Tone; dashed?: boolean; directed?: boolean; delay?: number;
}) {
  const { unit, ns } = useIso();
  const len = screenLength([from, to], unit);
  return (
    <line
      className={`iso-connector${dashed ? " is-dashed" : ""}`}
      {...seg(from, to, unit)}
      stroke={structureVar[tone]}
      markerEnd={directed ? `url(#${ns}-arrow)` : undefined}
      style={{ ["--iso-dash" as string]: `${Math.ceil(len) + 4}`, ["--iso-delay" as string]: `${delay}ms` }}
    />
  );
}

/* ---------- 13 · TechnicalLabel ----------
   Compact mono notation. Deliberately sparse: the explanation
   lives outside the SVG, so a label is a coordinate, a glyph or a
   state — never a sentence. */

export function TechnicalLabel({
  at, text, anchor = "start", dx = 0, dy = 0, tone = "neutral", size = "label", leader,
}: {
  at: Vec3; text: string;
  anchor?: "start" | "middle" | "end"; dx?: number; dy?: number;
  tone?: Tone; size?: "glyph" | "label" | "micro"; leader?: Vec3;
}) {
  const { unit } = useIso();
  const p = project(at, unit);
  return (
    <g className="iso-label-g">
      {leader && (
        <line
          className="iso-leader"
          {...seg(leader, at, unit)}
          stroke={structureVar[tone]}
        />
      )}
      <text
        className={`iso-label iso-label--${size}`}
        x={p.x + dx}
        y={p.y + dy}
        textAnchor={anchor}
        fill={toneVar[tone]}
      >
        {text}
      </text>
    </g>
  );
}

/* ---------- shared helper ---------- */

function seg(a: Vec3, b: Vec3, unit: number) {
  const pa = project(a, unit);
  const pb = project(b, unit);
  return { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y };
}

/** Re-exported so figures can build their own geometry from the same maths. */
export { closedPath, path, poly, project, quadXY, screenLength };
export type { Vec3 };
