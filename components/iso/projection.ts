/* ============================================================
   Isometric projection — the shared coordinate system.

   True isometric: the x and y axes sit at 30° above the horizon
   (so 30° / 150° on screen) and z is vertical. Every figure in the
   illustration system projects through this one function, which is
   what makes perspective consistent across the site.

       screen.x = (x − y) · cos30
       screen.y = (x + y) · sin30 − z

   World axes, as they read on screen:
     +x → right and down      (the 30° axis)
     +y → left and down       (the 150° axis)
     +z → straight up

   World units are abstract; a figure fixes the scale once by
   passing `unit` (pixels per world unit) and everything inside it
   inherits that scale.
   ============================================================ */

export const COS30 = Math.cos(Math.PI / 6); // 0.8660254…
export const SIN30 = 0.5;

export type Vec3 = readonly [x: number, y: number, z: number];
export interface Pt {
  x: number;
  y: number;
}

/** Project a world point to SVG user space. */
export function project([x, y, z]: Vec3, unit = 1): Pt {
  return {
    x: (x - y) * COS30 * unit,
    y: (x + y) * SIN30 * unit - z * unit,
  };
}

/** Project and format one point as "x,y" (2dp keeps the markup small). */
export function pt(v: Vec3, unit = 1): string {
  const p = project(v, unit);
  return `${round(p.x)},${round(p.y)}`;
}

/** Projected points as a `points` attribute for polygon / polyline. */
export function poly(vs: readonly Vec3[], unit = 1): string {
  return vs.map((v) => pt(v, unit)).join(" ");
}

/** Projected points as an open `d` path. */
export function path(vs: readonly Vec3[], unit = 1): string {
  return vs.map((v, i) => `${i === 0 ? "M" : "L"}${pt(v, unit)}`).join("");
}

/** Projected points as a closed `d` path. */
export function closedPath(vs: readonly Vec3[], unit = 1): string {
  return `${path(vs, unit)}Z`;
}

/**
 * Screen length of a projected polyline.
 *
 * Trajectory animation uses stroke-dashoffset, and an under-estimated dash
 * length leaves the tail of a path permanently undrawn — so this is measured
 * rather than guessed, and callers pad it slightly.
 */
export function screenLength(vs: readonly Vec3[], unit = 1): number {
  let total = 0;
  for (let i = 1; i < vs.length; i++) {
    const a = project(vs[i - 1], unit);
    const b = project(vs[i], unit);
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/** Linear interpolation between two world points. */
export function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/* ---------- Box faces ----------
   A box at origin (x, y, z) with size (w, d, h) shows exactly three faces in
   this projection: the top, the face at max-x (lower right) and the face at
   max-y (lower left). Back faces are never drawn — the geometry is open, not
   solid, which is what keeps the fills transparent. */

export interface BoxSpec {
  at: Vec3;
  size: readonly [w: number, d: number, h: number];
}

export function boxTop({ at: [x, y, z], size: [w, d, h] }: BoxSpec): Vec3[] {
  return [
    [x, y, z + h],
    [x + w, y, z + h],
    [x + w, y + d, z + h],
    [x, y + d, z + h],
  ];
}

/** The max-x face — reads as the right-hand wall. */
export function boxRight({ at: [x, y, z], size: [w, d, h] }: BoxSpec): Vec3[] {
  return [
    [x + w, y, z],
    [x + w, y + d, z],
    [x + w, y + d, z + h],
    [x + w, y, z + h],
  ];
}

/** The max-y face — reads as the left-hand wall. */
export function boxLeft({ at: [x, y, z], size: [w, d, h] }: BoxSpec): Vec3[] {
  return [
    [x, y + d, z],
    [x + w, y + d, z],
    [x + w, y + d, z + h],
    [x, y + d, z + h],
  ];
}

/** A flat quad on the horizontal plane at height z. */
export function quadXY(x: number, y: number, w: number, d: number, z = 0): Vec3[] {
  return [
    [x, y, z],
    [x + w, y, z],
    [x + w, y + d, z],
    [x, y + d, z],
  ];
}

/** A vertical quad standing along the x axis at a fixed y. */
export function quadXZ(x: number, y: number, w: number, h: number, z = 0): Vec3[] {
  return [
    [x, y, z],
    [x + w, y, z],
    [x + w, y, z + h],
    [x, y, z + h],
  ];
}

/** A vertical quad standing along the y axis at a fixed x. */
export function quadYZ(x: number, y: number, d: number, h: number, z = 0): Vec3[] {
  return [
    [x, y, z],
    [x, y + d, z],
    [x, y + d, z + h],
    [x, y, z + h],
  ];
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
