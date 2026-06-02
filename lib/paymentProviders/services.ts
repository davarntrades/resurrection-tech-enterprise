import type { ServiceDef } from "./types";

/**
 * Server-side catalogue of what can be paid for. Amounts are authoritative
 * here — the client never sends an amount. Enterprise engagements default to
 * invoice; online payment is offered only for approved deposits / retainers /
 * pre-agreed payments.
 */
export const SERVICES: ServiceDef[] = [
  {
    id: "assessment-deposit",
    name: "Runtime Safety Assessment — Deposit",
    amountMinor: 10_000_00, // £10,000
    currency: "gbp",
    kind: "deposit",
    online: true,
    providers: ["stripe", "gocardless"],
    blurb: "Secures a scheduled 48-hour Runtime Safety Assessment slot. Applied against the engagement fee.",
  },
  {
    id: "assessment",
    name: "Runtime Safety Assessment",
    amountMinor: null,
    currency: "gbp",
    kind: "invoice",
    online: false,
    providers: [],
    blurb: "£40K–£75K. Normally contracted and invoiced. A deposit may be paid online to reserve a slot.",
  },
  {
    id: "pilot",
    name: "Structural Safety Pilot",
    amountMinor: null,
    currency: "gbp",
    kind: "invoice",
    online: false,
    providers: [],
    blurb: "£250K–£750K+. Contracted and invoiced.",
  },
  {
    id: "integration",
    name: "Enterprise Integration",
    amountMinor: null,
    currency: "gbp",
    kind: "invoice",
    online: false,
    providers: [],
    blurb: "Scoped deployment. Contracted and invoiced.",
  },
  {
    id: "retainer",
    name: "Advisory Retainer",
    amountMinor: null,
    currency: "gbp",
    kind: "retainer",
    online: true,
    providers: ["gocardless"],
    blurb: "£35K–£100K/mo. Bank Debit via GoCardless for approved retainers, or invoiced.",
  },
];

export function getService(id: string): ServiceDef | undefined {
  return SERVICES.find((s) => s.id === id);
}
