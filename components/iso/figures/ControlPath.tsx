"use client";

import { IsoFigure } from "../IsoFigure";
import {
  BoundaryPlane,
  ExecutionGate,
  IsometricBox,
  IsometricGrid,
  StateNode,
  TechnicalLabel,
  TrajectoryPath,
  type Vec3,
} from "../primitives";
import { IsoKey } from "../IsoKey";

/* ============================================================
   Class: architecture-flow
   Dominant concept: the authority layer sits between proposal and
   execution.

   Three volumes on one ground plane, in a straight isometric run.
   The middle volume is the only one the boundary passes through —
   which is the whole argument: nothing reaches execution without
   crossing it.
   ============================================================ */

const PAD_D = 2.6;
const PADS: { at: Vec3; label: string; sub: string; tone: "neutral" | "accent" }[] = [
  { at: [0, 0, 0], label: "PROPOSAL", sub: "AGENT PROPOSES", tone: "neutral" },
  { at: [4.4, 0, 0], label: "AUTHORITY", sub: "INDEPENDENTLY EVALUATED", tone: "accent" },
  { at: [8.8, 0, 0], label: "EXECUTION", sub: "ACTION COMMITS", tone: "neutral" },
];

const RUN: Vec3[] = [
  [1.5, 1.3, 0.62],
  [4.4, 1.3, 0.62],
];
const RUN2: Vec3[] = [
  [7.3, 1.3, 0.62],
  [10.3, 1.3, 0.62],
];

export function ControlPathFigure({ className }: { className?: string }) {
  return (
    <IsoFigure
      className={className}
      title="Proposal, authority and execution on one control path"
      desc={
        "Three volumes stand in a line on an isometric ground plane: proposal, authority and " +
        "execution. The authorization boundary passes through the middle volume, so the only " +
        "route from proposal to execution runs through the authority layer."
      }
      bounds={{ x: [-0.5, 11.4], y: [-1.2, 3], z: [0, 2.7] }}
      legend={
        <>
          <IsoKey tone="accent" shape="line" label="Control path — proposal to execution" />
          <IsoKey tone="neutral" shape="plane" label="Authorization boundary" />
        </>
      }
      caption="The deployment profile changes where enforcement runs. It does not change the path."
    >
      <IsometricGrid x={-1} y={-1} w={13} d={4} />

      {PADS.map((p) => (
        <g key={p.label}>
          <IsometricBox
            at={p.at}
            size={[2.9, PAD_D, 0.62]}
            tone={p.tone}
            fill={p.tone === "accent" ? "hatch" : "none"}
          />
          <TechnicalLabel
            at={[p.at[0] + 1.45, p.at[1] + PAD_D / 2, 0.62]}
            text={p.label}
            anchor="middle"
            dy={-32}
            tone={p.tone}
          />
          <TechnicalLabel
            at={[p.at[0] + 1.45, p.at[1] + PAD_D, 0]}
            text={p.sub}
            anchor="middle"
            dy={42}
            tone="neutral"
            size="micro"
          />
        </g>
      ))}

      {/* The boundary cuts the middle volume: the authority layer is
          where the plane is, not a stage that happens to precede it. */}
      <BoundaryPlane at={[5.85, -1.1, 0]} length={4.8} height={2.7} axis="y" tone="neutral" mullions={3} />
      <ExecutionGate at={[5.85, 0.75, 0]} width={1.1} height={1.5} axis="y" tone="accent" open />

      <TrajectoryPath points={RUN} tone="accent" state="authorized" delay={0} />
      <TrajectoryPath points={RUN2} tone="accent" state="authorized" delay={420} />

      <StateNode at={[1.5, 1.3, 0.62]} tone="neutral" drop={false} delay={60} />
      <StateNode at={[10.3, 1.3, 0.62]} tone="accent" drop={false} delay={780} />
    </IsoFigure>
  );
}
