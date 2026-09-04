"use client";

import { IsoFigure } from "../IsoFigure";
import {
  BoundaryPlane,
  ExecutionGate,
  ForbiddenRegion,
  IsometricGrid,
  StateNode,
  TechnicalLabel,
  TrajectoryPath,
  type Vec3,
} from "../primitives";
import { IsoKey } from "../IsoKey";

/* ============================================================
   Class: execution-boundary
   Dominant concept: a proposed transition does not execute until
   authorization is satisfied.

   Composition, in world space:
     · travel runs along +x — down-right on screen
     · the boundary stands along y at x = 6 — down-left on screen,
       so it reads as a wall the path must cross
     · Ω sits past the boundary and toward −y, which projects clear
       to the upper right with no overlap against the wall
     · the authorized path passes through the gate at y ≈ 0
     · the denied path banks toward Ω and stops flush against the
       wall, well away from the opening

   The denial is carried by the line physically stopping, not by
   recolouring a node that still arrives.
   ============================================================ */

const BX = 6; // boundary plane, x

const AUTHORIZED: Vec3[] = [
  [0, 0, 0],
  [2.0, -0.1, 0.85],
  [4.2, 0, 1.05],
  [BX, 0.1, 1.05],
  [8.0, 0.25, 0.7],
  [9.6, 0.35, 0.3],
];

const TERMINATED: Vec3[] = [
  [0, 0, 0],
  [1.8, -1.0, 1.25],
  [3.6, -2.0, 1.95],
  [5.1, -2.5, 2.2],
  [BX, -2.7, 2.25],
];

export function ExecutionBoundaryFigure({ className }: { className?: string }) {
  return (
    <IsoFigure
      className={className}
      title="Authorized and blocked transitions at the execution boundary"
      desc={
        "An isometric state space. From a single origin state, two proposed transitions " +
        "diverge. One rises through an opening in the authorization boundary and reaches a " +
        "committed execution state beyond it. The other climbs toward the forbidden region " +
        "Omega and terminates against the boundary plane, marked execution denied; it never " +
        "reaches an execution state."
      }
      bounds={{ x: [-0.4, 10.6], y: [-5.1, 2.1], z: [0, 2.9] }}
      legend={
        <>
          <IsoKey tone="accent" shape="line" label="Authorized transition — execution committed" />
          <IsoKey tone="omega" shape="stop" label="Proposed transition — terminated at the boundary" />
          <IsoKey tone="omega" shape="hatch" label="Ω — configured forbidden region" />
          <IsoKey tone="neutral" shape="plane" label="Authorization boundary ∂E" />
        </>
      }
      caption="Within the declared bounded model, no configured forbidden state remains reachable under the governed transition system."
    >
      <IsometricGrid x={-0.4} y={-4.6} w={11} d={6.6} />

      {/* Ω: past the boundary and to −y, so it projects clear of the wall. */}
      <ForbiddenRegion at={[7.5, -4.6, 0]} size={[2.6, 2.0, 1.5]} label="FORBIDDEN REGION" />

      <BoundaryPlane
        at={[BX, -3.6, 0]}
        length={5.6}
        height={2.6}
        axis="y"
        tone="neutral"
        mullions={5}
        label="AUTHORIZATION BOUNDARY"
        labelAnchor="end"
        labelDx={-12}
      />
      <ExecutionGate at={[BX, -0.55, 0]} width={1.3} height={1.6} axis="y" tone="accent" open />

      <StateNode at={[0, 0, 0]} kind="origin" tone="neutral" label="x(t₀)" anchor="end" dx={-12} dy={16} />

      {/* Denied first, so the authorized path reads on top where they cross. */}
      <TrajectoryPath points={TERMINATED} tone="omega" state="terminated" dashed delay={200} />
      <TechnicalLabel
        at={[BX, -2.7, 2.25]}
        text="EXECUTION DENIED"
        anchor="middle"
        dy={-20}
        tone="omega"
      />

      <TrajectoryPath points={AUTHORIZED} tone="accent" state="authorized" delay={0} />
      <StateNode
        at={[9.6, 0.35, 0.3]}
        tone="accent"
        kind="terminal"
        label="AUTHORIZED"
        sublabel="EXECUTION COMMITTED"
        anchor="start"
        dx={16}
        dy={-4}
        delay={640}
      />
    </IsoFigure>
  );
}
