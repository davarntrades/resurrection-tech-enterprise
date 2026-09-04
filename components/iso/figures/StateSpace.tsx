"use client";

import { IsoFigure } from "../IsoFigure";
import {
  Connector,
  ForbiddenRegion,
  IsometricGrid,
  IsometricPlane,
  StateNode,
  TechnicalLabel,
  TrajectoryPath,
  type Vec3,
} from "../primitives";
import { IsoKey } from "../IsoKey";

/* ============================================================
   Class: state-space
   Dominant concept: a transition takes the environment from x(t)
   to x(t+1), and the envelope is the region those states may
   occupy.

   The admissible region is a dotted plane on the ground — a
   footprint, not a container. One trajectory steps through it;
   the step that would leave it is drawn to the edge and stopped.
   ============================================================ */

const WALK: Vec3[] = [
  [0.7, 0.6, 0.7],
  [2.3, 1.0, 0.85],
  [3.8, 1.9, 0.75],
  [5.2, 2.3, 0.85],
];
/* The step that leaves the envelope: it crosses ∂E heading toward Ω and is
   terminated outside the permitted region. */
const LEAVE: Vec3[] = [
  [5.2, 2.3, 0.85],
  [6.6, 2.7, 0.95],
  [7.5, 2.9, 1.0],
];

export function StateSpaceFigure({ className }: { className?: string }) {
  return (
    <IsoFigure
      className={className}
      title="State transitions inside an admissible operating envelope"
      desc={
        "An isometric ground plane carries a dotted region: the admissible operating envelope. " +
        "A trajectory steps through it from an initial state, each step a transition from one " +
        "state to the next. The step that would leave the envelope is drawn to its edge and " +
        "terminated. The forbidden region Omega lies beyond."
      }
      bounds={{ x: [-0.6, 10.4], y: [-0.6, 4.4], z: [0, 1.6] }}
      legend={
        <>
          <IsoKey tone="accent" shape="line" label="x(t) → x(t+1) — admissible transition" />
          <IsoKey tone="neutral" shape="dots" label="Admissible Operating Envelope" />
          <IsoKey tone="omega" shape="stop" label="Transition leaving the envelope — terminated" />
        </>
      }
      caption="The unit of evaluation is the transition and the trajectory it belongs to, not the output."
    >
      <IsometricGrid x={-0.6} y={-0.6} w={11} d={5} />

      {/* The envelope: a footprint marked by dot density, not a container. */}
      <IsometricPlane x={0} y={0} w={6} d={3.6} tone="neutral" fill="dots" dashed />
      <TechnicalLabel
        at={[0, 3.6, 0]}
        text="ADMISSIBLE OPERATING ENVELOPE"
        anchor="end"
        dx={-12}
        dy={16}
        tone="neutral"
        size="micro"
      />
      <TechnicalLabel at={[6, 3.6, 0]} text="∂E" anchor="start" dx={12} dy={14} tone="neutral" />

      {/* Ω sits entirely outside the envelope, on the same ground plane. */}
      <ForbiddenRegion at={[8.0, 1.9, 0]} size={[2.0, 1.6, 1.1]} />

      {/* Ground trace of the walk — the transitions, projected onto the plane. */}
      {WALK.slice(0, -1).map((_, i) => (
        <Connector
          key={i}
          from={[WALK[i][0], WALK[i][1], 0]}
          to={[WALK[i + 1][0], WALK[i + 1][1], 0]}
          tone="neutral"
          dashed
          delay={i * 90}
        />
      ))}

      <TrajectoryPath points={WALK} tone="accent" state="authorized" delay={0} />
      <TrajectoryPath points={LEAVE} tone="omega" state="terminated" dashed delay={560} />

      <StateNode at={WALK[0]} kind="origin" tone="neutral" label="x(t₀)" anchor="end" dx={-14} dy={2} />
      <StateNode at={WALK[1]} tone="neutral" drop delay={160} />
      <StateNode at={WALK[2]} tone="neutral" drop delay={260} />
      <StateNode at={WALK[3]} tone="accent" drop label="x(t+1)" anchor="end" dx={-14} dy={-12} delay={380} />
      <TechnicalLabel at={LEAVE[2]} text="OUTSIDE ENVELOPE" anchor="middle" dy={-22} tone="omega" />

    </IsoFigure>
  );
}
