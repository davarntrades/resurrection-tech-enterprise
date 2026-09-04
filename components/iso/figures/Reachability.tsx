"use client";

import { IsoFigure } from "../IsoFigure";
import {
  Connector,
  ForbiddenRegion,
  IsometricGrid,
  StateNode,
  TechnicalLabel,
  TrajectoryPath,
  type Vec3,
} from "../primitives";
import { IsoKey } from "../IsoKey";

/* ============================================================
   Class: reachability
   Dominant concept: Reach_G(X₀) ∩ Ω = ∅ — what the governed
   transition system can and cannot reach.

   A layered state space read left to right along the 30° axis.
   States are nodes, transitions are edges. The reachable set
   propagates; the edges that would enter Ω are drawn to the
   region's face and stopped there.

   This replaces the canvas version: same idea, but vector, so it
   stays crisp, themeable and legible at any size.
   ============================================================ */

/* Four layers along +x, spread along ±y, lifted slightly so the
   graph floats over its own ground trace. */
const S: Record<string, Vec3> = {
  x0: [0, 0, 1.1],
  a1: [2.6, -1.5, 1.5],
  a2: [2.6, 1.4, 1.0],
  b1: [5.2, -2.4, 1.9],
  b2: [5.2, 0.1, 1.35],
  b3: [5.2, 2.3, 0.9],
  c1: [7.8, -1.0, 1.6],
  c2: [7.8, 1.8, 1.1],
};

/* Admissible edges — the reachable set. */
const EDGES: [Vec3, Vec3][] = [
  [S.x0, S.a1],
  [S.x0, S.a2],
  [S.a1, S.b1],
  [S.a1, S.b2],
  [S.a2, S.b2],
  [S.a2, S.b3],
  [S.b2, S.c1],
  [S.b3, S.c2],
];

/* A transition that would enter Ω, terminated at the region face. */
const DENIED: Vec3[] = [S.b1, [6.8, -3.2, 1.95], [7.9, -3.6, 1.85]];

export function ReachabilityFigure({ className }: { className?: string }) {
  return (
    <IsoFigure
      className={className}
      title="Reachable set under the governed transition system"
      desc={
        "An isometric state space. States are nodes and transitions are edges. From the " +
        "initial state, admissible transitions propagate across four layers, forming the " +
        "reachable set. One transition that would enter the forbidden region Omega is drawn " +
        "to the region's face and terminated there, so no forbidden state is reached."
      }
      bounds={{ x: [-0.6, 10.6], y: [-4.8, 3.0], z: [0, 2.0] }}
      legend={
        <>
          <IsoKey tone="accent" shape="node" label="State inside the reachable set" />
          <IsoKey tone="neutral" shape="line" label="Admissible transition" />
          <IsoKey tone="omega" shape="stop" label="Transition denied at the region face" />
          <IsoKey tone="omega" shape="dots" label="Ω — configured forbidden region" />
        </>
      }
      caption="Reach_G(X₀) ∩ Ω = ∅ — within the declared bounded model, no configured forbidden state remains reachable."
    >
      <IsometricGrid x={-0.6} y={-4.8} w={11.2} d={7.8} />

      <ForbiddenRegion at={[8.1, -4.6, 0]} size={[2.2, 1.8, 1.3]} />

      {EDGES.map(([a, b], i) => (
        <Connector key={i} from={a} to={b} tone="neutral" delay={i * 70} />
      ))}

      <TrajectoryPath points={DENIED} tone="omega" state="terminated" dashed delay={640} />
      <TechnicalLabel at={DENIED[2]} text="DENIED" anchor="end" dx={-14} dy={-8} tone="omega" />

      <StateNode at={S.x0} kind="origin" tone="neutral" label="x(t₀)" anchor="end" dx={-14} dy={4} />
      {(["a1", "a2", "b1", "b2", "b3"] as const).map((k, i) => (
        <StateNode key={k} at={S[k]} tone="neutral" drop={false} delay={140 + i * 70} />
      ))}
      <StateNode at={S.c1} tone="accent" drop={false} delay={560} />
      <StateNode at={S.c2} tone="accent" drop={false} delay={630} />
      <TechnicalLabel at={S.c1} text="REACH_G(X₀)" anchor="start" dx={16} dy={-8} tone="accent" />
    </IsoFigure>
  );
}
