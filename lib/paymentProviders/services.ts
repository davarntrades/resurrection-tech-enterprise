import type { DepositTier, ServiceDef } from "./types";

/**
 * Server-side catalogue of what can be paid for. Amounts are authoritative
 * here — the client never sends an amount. Enterprise engagements default to
 * invoice; online deposits reserve capacity and accelerate onboarding.
 *
 * Future-proofing: add a new deposit product by appending an entry below.
 * The /pay page renders every entry generically — no page redesign required.
 *
 * Deposit amounts: a service with `tiers` lets the buyer choose which deposit
 * to pay (the first tier is the default and the lower bound of the range). A
 * service without `tiers` charges the single `amountMinor`. To turn a
 * single-price deposit into a choice, add a `tiers` array — nothing else needs
 * to change. `amountMinor` stays as the fallback when no tier is selected.
 */
export const SERVICES: ServiceDef[] = [
  {
    id: "discovery-workshop",
    name: "Enterprise Discovery Workshop",
    amountMinor: 5_000_00, // default / fallback: lower bound of the range
    tiers: [
      { id: "5000", label: "£5,000", amountMinor: 5_000_00, note: "Minimum to reserve a workshop slot." },
      { id: "10000", label: "£10,000", amountMinor: 10_000_00, note: "Extended scope — multi-team review." },
      { id: "15000", label: "£15,000", amountMinor: 15_000_00, note: "Full programme — reserves the whole engagement." },
    ],
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
    // id stays "assessment-deposit" — it keys existing provider metadata and
    // recorded payments; only the customer-facing name changed.
    id: "assessment-deposit",
    name: "48-Hour Runtime Governance Audit",
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
      "Reserve a 48-hour Runtime Governance Audit engagement slot. Deposit is credited against the final engagement fee.",
  },
  {
    id: "pilot-deposit",
    name: "Limited Pilot",
    amountMinor: 25_000_00, // default / fallback: lower bound of the range
    tiers: [
      { id: "25000", label: "£25,000", amountMinor: 25_000_00, note: "Minimum to reserve pilot capacity." },
      { id: "35000", label: "£35,000", amountMinor: 35_000_00, note: "Priority scheduling and deployment planning." },
      { id: "50000", label: "£50,000", amountMinor: 50_000_00, note: "Full reservation — largest credit against the pilot fee." },
    ],
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
    id: "annual-governance-license",
    name: "Annual Runtime Governance™ License",
    amountMinor: null,
    currency: "gbp",
    kind: "invoice",
    online: false,
    providers: [],
    engagementValue: "£75,000–£500,000+ / yr",
    priceLabel: "£75,000–£500,000+ / yr",
    statusLabel: "Invoice workflow only",
    gateNote: "Approved engagements only.",
    buyers: ["Platform / Product Owner", "Enterprise Architecture", "Procurement"],
    blurb:
      "Annual licence for ongoing Runtime Governance — continuous monitoring, updates, support, and revalidation as systems, tools, models, and regulations change. Scope and term confirmed after commercial and architecture review.",
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
    priceLabel: "£35,000–£100,000+ / mo",
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

/**
 * Resolve a client-supplied tier id against the server catalogue.
 * Returns `undefined` for services without tiers (single-price), and `null`
 * when a tier id was supplied but does not belong to this service — callers
 * must reject that rather than silently falling back to another amount.
 */
export function getTier(service: ServiceDef, tierId?: string): DepositTier | undefined | null {
  if (!service.tiers?.length) return undefined;
  if (!tierId) return service.tiers[0];
  return service.tiers.find((t) => t.id === tierId) ?? null;
}
