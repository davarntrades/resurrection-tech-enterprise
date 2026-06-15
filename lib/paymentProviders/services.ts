import type { ServiceDef } from "./types";

/**
 * Server-side catalogue of what can be paid for. Amounts are authoritative
 * here — the client never sends an amount. Enterprise engagements default to
 * invoice; online deposits reserve capacity and accelerate onboarding.
 *
 * Future-proofing: add a new deposit product by appending an entry below.
 * The /pay page renders every entry generically — no page redesign required.
 * Deposit ranges are reserved online at the entry (lower-bound) amount; the
 * full range is shown to the buyer and credited against the final fee.
 */
export const SERVICES: ServiceDef[] = [
  {
    id: "discovery-workshop",
    name: "Enterprise Discovery Workshop",
    amountMinor: 5_000_00, // £5,000 reservation deposit (range £5,000–£15,000)
    currency: "gbp",
    kind: "deposit",
    online: true,
    providers: ["stripe", "gocardless"],
    isDeposit: true,
    priceLabel: "£5,000–£15,000 deposit",
    statusLabel: "Online payment enabled",
    gateNote: "Schedule required before payment.",
    buyers: ["Head of AI", "Innovation Director", "CTO"],
    blurb:
      "A paid architecture and governance review for organisations evaluating Morrison Runtime Governance™. Includes executive briefing, risk mapping, deployment pathways, pilot recommendations, and implementation planning.",
  },
  {
    id: "assessment-deposit",
    name: "Runtime Safety Assessment",
    amountMinor: 10_000_00, // £10,000 deposit
    currency: "gbp",
    kind: "deposit",
    online: true,
    providers: ["stripe", "gocardless"],
    isDeposit: true,
    engagementValue: "£40,000–£75,000",
    priceLabel: "£10,000 deposit",
    statusLabel: "Online payment enabled",
    gateNote: "Schedule required before payment.",
    buyers: ["CFO", "Chief Risk Officer", "Compliance Officer", "Controller", "Head of AI"],
    blurb:
      "Reserve a 48-hour Runtime Safety Assessment engagement slot. Deposit is credited against the final engagement fee.",
  },
  {
    id: "pilot-deposit",
    name: "Limited Pilot",
    amountMinor: 25_000_00, // £25,000 reservation deposit (range £25,000–£50,000)
    currency: "gbp",
    kind: "deposit",
    online: true,
    providers: ["stripe", "gocardless"],
    isDeposit: true,
    engagementValue: "£250,000–£750,000+",
    priceLabel: "£25,000–£50,000 deposit",
    statusLabel: "Online payment enabled",
    gateNote: "Pilot capacity reserved following architecture review and approval.",
    buyers: ["CEO Sponsor", "Executive Committee", "Transformation Lead"],
    blurb:
      "Reserve a Limited Pilot engagement. Deposit secures pilot capacity and deployment planning and is credited against the final pilot fee.",
  },
  {
    id: "enterprise-integration",
    name: "Enterprise Integration",
    amountMinor: null,
    currency: "gbp",
    kind: "invoice",
    online: false,
    providers: [],
    priceLabel: "Custom",
    statusLabel: "Invoice workflow only",
    gateNote: "Approved engagements only.",
    buyers: ["Board-approved programme", "Procurement", "Enterprise Architecture"],
    blurb:
      "Custom-scoped deployment of Morrison Runtime Governance™ within enterprise environments. Pricing determined after architecture review, governance mapping, integration requirements, and deployment scope.",
  },
  {
    id: "advisory-retainer",
    name: "Advisory Retainer",
    amountMinor: null, // recurring mandate setup; billed monthly on agreed terms
    currency: "gbp",
    kind: "retainer",
    online: true,
    providers: ["gocardless"],
    recurring: true,
    priceLabel: "£35,000–£100,000 / mo",
    statusLabel: "Recurring payments enabled",
    gateNote: "Available for approved clients only.",
    buyers: ["Executive Leadership", "Risk & Governance Teams"],
    blurb:
      "Ongoing strategic advisory, deployment support, governance reviews, executive guidance, architecture oversight, and runtime safety consultation.",
  },
];

export function getService(id: string): ServiceDef | undefined {
  return SERVICES.find((s) => s.id === id);
}
