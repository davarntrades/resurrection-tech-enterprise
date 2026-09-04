"use client";

import { IsoFigure } from "../IsoFigure";
import {
  BoundaryPlane,
  Connector,
  IsometricBox,
  IsometricGrid,
  StateNode,
  TechnicalLabel,
  type Vec3,
} from "../primitives";
import { IsoKey } from "../IsoKey";

/* ============================================================
   Class: sovereign-boundary
   Dominant concept: one kernel, many deployment profiles, and a
   jurisdiction boundary that the control path never crosses.

   Six profile pads converge on a single kernel volume. The
   sovereign boundary encloses the kernel, and the external
   control-plane connector is drawn severed at that boundary —
   which is what "no required external control plane" means
   architecturally.
   ============================================================ */

const PROFILES = [
  { label: "CLOUD", y: -3.0 },
  { label: "HYBRID", y: -1.8 },
  { label: "PRIVATE", y: -0.6 },
  { label: "ON-PREM", y: 0.6 },
  { label: "SOVEREIGN", y: 1.8 },
  { label: "AIR-GAPPED", y: 3.0 },
] as const;

const KERNEL: Vec3 = [5.8, -0.9, 0];
const KERNEL_SIZE = [2.4, 2.4, 0.9] as const;
const KERNEL_TOP: Vec3 = [5.8 + 1.2, -0.9 + 1.2, 0.9];

export function SovereignBoundaryFigure({ className }: { className?: string }) {
  return (
    <IsoFigure
      className={className}
      title="One governance kernel behind a sovereign boundary"
      desc={
        "Six deployment profiles — cloud, hybrid, private cloud, on-premises, sovereign and " +
        "air-gapped — converge on a single governance kernel volume. A sovereign boundary " +
        "encloses the kernel. The connector to an external control plane is drawn terminating " +
        "at that boundary: the kernel requires no external control plane and no network."
      }
      bounds={{ x: [-0.5, 10.9], y: [-3.6, 3.2], z: [0, 2.8] }}
      legend={
        <>
          <IsoKey tone="accent" shape="line" label="Control path — profile to kernel" />
          <IsoKey tone="neutral" shape="plane" label="Sovereign boundary" />
          <IsoKey tone="omega" shape="stop" label="External control plane — not required, not crossed" />
        </>
      }
      caption="The deployment profile changes where enforcement runs and who holds the keys. It does not change the control contract."
    >
      <IsometricGrid x={-0.5} y={-3.6} w={11.4} d={6.8} />

      {PROFILES.map((p, i) => (
        <g key={p.label}>
          <IsometricBox at={[0, p.y, 0]} size={[1.5, 0.85, 0.2]} tone="neutral" />
          <TechnicalLabel
            at={[0, p.y + 0.42, 0.2]}
            text={p.label}
            anchor="end"
            dx={-12}
            dy={4}
            tone="neutral"
            size="micro"
          />
          <Connector
            from={[1.5, p.y + 0.42, 0.2]}
            to={[KERNEL[0], -0.9 + 1.2, 0.5]}
            tone="accent"
            delay={i * 90}
          />
        </g>
      ))}

      {/* The kernel. The only volume carrying the accent. */}
      <IsometricBox at={KERNEL} size={KERNEL_SIZE} tone="accent" fill="hatch" />
      <TechnicalLabel at={KERNEL_TOP} text="KERNEL" anchor="middle" dy={-16} tone="accent" />
      <TechnicalLabel at={KERNEL_TOP} text="ONE CONTROL CONTRACT" anchor="middle" dy={32} tone="neutral" size="micro" />
      <StateNode at={KERNEL_TOP} tone="accent" drop={false} delay={620} />

      {/* The sovereign boundary encloses the kernel. */}
      <BoundaryPlane
        at={[10.2, -3.4, 0]}
        length={5.2}
        height={2.7}
        axis="y"
        tone="neutral"
        mullions={4}
        label="SOVEREIGN BOUNDARY"
        labelAnchor="start"
        labelDx={12}
        labelDy={-6}
        labelEnd="near"
      />

      {/* The external dependency, terminated at the boundary. */}
      <Connector from={KERNEL_TOP} to={[10.06, -0.9 + 1.2, 0.9]} tone="omega" dashed delay={760} />
      <g className="iso-traj-stop" style={{ ["--iso-delay" as string]: "900ms" }}>
        <TechnicalLabel
          at={[10.2, 0.5, 0.9]}
          text="NO REQUIRED NETWORK"
          anchor="start"
          dx={14}
          dy={4}
          tone="omega"
        />
      </g>
    </IsoFigure>
  );
}
