"use client";

import { IsoFigure } from "../IsoFigure";
import {
  Connector,
  EvidenceNode,
  IsometricBox,
  IsometricGrid,
  TechnicalLabel,
  type Vec3,
} from "../primitives";
import { IsoKey } from "../IsoKey";

/* ============================================================
   Class: evidence-chain
   Dominant concept: each record hashes the one before it, so an
   alteration anywhere breaks verification.

   Records step up and along the isometric run, linked by the
   hash. The linkage is the subject, so it is the only thing drawn
   at key weight; the record volumes stay transparent.
   ============================================================ */

const STEPS = [
  { k: "01", label: "PROPOSAL" },
  { k: "02", label: "POLICY" },
  { k: "03", label: "VERDICT" },
  { k: "04", label: "APPROVAL" },
  { k: "05", label: "EXECUTION" },
  { k: "06", label: "EVIDENCE" },
] as const;

const DX = 1.85;
const DZ = 0.34;

export function EvidenceChainFigure({ className }: { className?: string }) {
  return (
    <IsoFigure
      className={className}
      title="Hash-linked evidence chain"
      desc={
        "Six records step up and along an isometric run: proposal, policy, verdict, approval, " +
        "execution and evidence. Each record is linked to the one before it by a hash, and the " +
        "final record is marked verified. An alteration to any record breaks the linkage."
      }
      bounds={{ x: [-0.5, 13.4], y: [-0.5, 2.3], z: [0, 2.1] }}
      legend={
        <>
          <IsoKey tone="accent" shape="line" label="Hash linkage — each record hashes the previous" />
          <IsoKey tone="ok" shape="evidence" label="Verified record" />
        </>
      }
      caption="The same proposal against the same policy state reproduces the same verdict. A record that has been altered fails chain verification."
    >
      <IsometricGrid x={-0.5} y={-0.5} w={11.8} d={2.8} />

      {STEPS.map((s, i) => {
        const at: Vec3 = [i * DX, 0, i * DZ];
        /* Centre of the record's top face — labels float above it rather than
           sitting on the face, where they would fight the box edges. */
        const centre: Vec3 = [i * DX + 0.675, 0.9, i * DZ + 0.26];
        const last = i === STEPS.length - 1;
        return (
          <g key={s.k}>
            <IsometricBox
              at={at}
              size={[1.35, 1.8, 0.26]}
              tone={last ? "ok" : "neutral"}
              fill={last ? "hatch" : "none"}
            />
            {i > 0 && (
              <Connector
                from={[(i - 1) * DX + 1.35, 0.9, (i - 1) * DZ + 0.26]}
                to={[i * DX, 0.9, i * DZ + 0.26]}
                tone="accent"
                directed
                delay={i * 130}
              />
            )}
            <TechnicalLabel at={centre} text={s.k} anchor="middle" dy={-42} tone="neutral" size="micro" />
            <TechnicalLabel
              at={centre}
              text={s.label}
              anchor="middle"
              dy={-26}
              tone={last ? "ok" : "neutral"}
            />
          </g>
        );
      })}

      {/* The verified mark sits past the end of the chain, linked to it, so it
          reads as the result of the linkage rather than a badge on a record. */}
      <Connector
        from={[(STEPS.length - 1) * DX + 1.35, 0.9, (STEPS.length - 1) * DZ + 0.26]}
        to={[(STEPS.length - 1) * DX + 2.35, 0.9, (STEPS.length - 1) * DZ + 0.26]}
        tone="ok"
        directed
        delay={STEPS.length * 130}
      />
      <EvidenceNode
        at={[(STEPS.length - 1) * DX + 2.75, 0.9, (STEPS.length - 1) * DZ + 0.26]}
        sublabel="CHAIN VERIFIED"
        verified
        delay={STEPS.length * 130 + 120}
      />

    </IsoFigure>
  );
}
