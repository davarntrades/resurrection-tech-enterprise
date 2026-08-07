import type { DepositTier, ServiceDef } from "./types";

/**
 * Server-side catalogue of what can be paid for. Amounts are authoritative
 * here — the client never sends an amount. Enterprise engagements default to
 * invoice; online deposits reserve capacity and accelerate onboarding.
 *
 * Order matters: the /pay page renders entries in the order below, within the
 * block named by each entry's `group`. The three primary entry routes lead so
 * the commercial priority stays obvious no matter how many services are added.
 *
 * Future-proofing: add a new product by appending an entry with a `group`.
 * The page renders every entry generically — no page redesign required.
 *
 * Amounts: a service with `tiers` lets the buyer choose which amount to pay
 * (the recommended tier is pre-selected, else the lowest). A service without
 * `tiers` charges the single `amountMinor`. To turn a single-price service
 * into a choice, add a `tiers` array — nothing else needs to change.
 * `amountMinor` stays as the fallback when no tier is selected.
 */
export const SERVICES: ServiceDef[] = [
  // ── Primary entry routes ────────────────────────────────────────────────
  {
    // id stays "assessment-deposit" — it keys existing provider metadata and
    // recorded payments; only the customer-facing name changed.
    id: "assessment-deposit",
    name: "48-Hour Runtime Governance Audit",
    amountMinor: 10_000_00, // £10,000 deposit
    currency: "gbp",
    kind: "deposit",
    group: "entry",
    primaryPathway: true,
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
    group: "entry",
    primaryPathway: true,
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
    group: "entry",
    primaryPathway: true,
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
    // Not one of the three primary routes, but a genuine entry point for
    // organisations scoping earlier — sits after the ladder, not above it.
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
    group: "entry",
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

  // ── Ongoing governance & executive services ─────────────────────────────
  {
    id: "annual-governance-license",
    name: "Annual Runtime Governance™ License",
    amountMinor: null,
    currency: "gbp",
    kind: "invoice",
    group: "ongoing",
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
    id: "continuous-governance",
    name: "Continuous Governance",
    amountMinor: null,
    currency: "gbp",
    kind: "retainer",
    group: "ongoing",
    online: false,
    providers: [],
    // Full band, not "from £5,000" — a floor alone anchors the whole managed
    // governance offering at the bottom of its range.
    priceLabel: "£5,000–£50,000 / mo",
    statusLabel: "Engagement by request",
    gateNote: "Scoped against deployment size and governance surface.",
    ctaLabel: "Request Engagement",
    buyers: ["Head of AI", "Risk & Governance Teams", "Platform / Product Owner"],
    blurb:
      "Ongoing Runtime Governance oversight following deployment — governance policy evolution, threat-surface monitoring, runtime validation reviews, planner revalidation, incident analysis, executive governance reporting, domain expansion support, and operational assurance reviews.",
  },
  {
    // id kept from the former "Advisory Retainer" so existing references and
    // any recorded payments still resolve; this is now the executive tier.
    id: "advisory-retainer",
    name: "Executive Advisory Retainer",
    amountMinor: null,
    currency: "gbp",
    kind: "retainer",
    group: "ongoing",
    online: false,
    providers: [],
    priceLabel: "£35,000–£120,000 / mo",
    statusLabel: "Application required",
    gateNote: "Available for approved clients only.",
    ctaLabel: "Apply for Executive Advisory",
    buyers: ["Executive Leadership", "CTO / CIO", "Risk & Governance Teams"],
    blurb:
      "Executive-level governance leadership beyond operational support — executive AI governance strategy, governance roadmap development, quarterly executive steering reviews, board-level governance reporting, cross-functional governance alignment, and enterprise governance maturity planning.",
  },
  {
    id: "fractional-caio",
    name: "Fractional Chief AI Officer (CAIO)",
    amountMinor: null,
    currency: "gbp",
    kind: "retainer",
    group: "ongoing",
    online: false,
    providers: [],
    priceLabel: "£50,000–£150,000 / mo",
    statusLabel: "Executive engagement by request",
    gateNote: "Premium add-on · scope agreed with executive sponsor.",
    ctaLabel: "Request Executive Engagement",
    buyers: ["CEO", "Board", "Executive Committee"],
    blurb:
      "Part-time executive leadership for organisations requiring ongoing AI strategy, deployment governance, executive decision support, and governance programme leadership without appointing a full-time Chief AI Officer.",
  },
  {
    id: "frontier-partnership",
    name: "Frontier AI Strategic Partnership™",
    amountMinor: null,
    currency: "gbp",
    kind: "invoice",
    group: "ongoing",
    // Deliberately gated: no published figure, full-width treatment, and copy
    // that reads as a negotiated relationship rather than a purchasable tier.
    gated: true,
    online: false,
    providers: [],
    priceLabel: "Commercial review",
    statusLabel: "By commercial review · minimum annual commitment",
    gateNote: "Engagement opens with a commercial and governance review, not a price list.",
    ctaLabel: "Discuss Strategic Partnership",
    buyers: ["Frontier AI Labs", "Foundation Model Providers", "AI Infrastructure Platforms", "Sovereign AI Programmes", "Autonomous Agent Platforms"],
    blurb:
      "Strategic governance engagement for frontier AI labs, foundation model providers, AI infrastructure platforms, autonomous agent platforms, and sovereign AI programmes. Scope may include model-release governance, safety-operations integration, runtime deployment controls, planner validation, strategic roadmap development, and executive governance. This is a negotiated strategic relationship — scope, terms, and minimum annual commitment are set directly, not selected from a package.",
  },

  // ── Partner & channel pathways ──────────────────────────────────────────
  {
    id: "partner-onboarding",
    name: "Managed Governance Partner™ Onboarding",
    // Not a deposit: this is the onboarding engagement fee itself, paid in
    // full. Fallback matches the recommended tier below.
    amountMinor: 35_000_00,
    tiers: [
      { id: "25000", label: "£25,000", amountMinor: 25_000_00, note: "Entry onboarding — architecture review and deployment planning." },
      { id: "35000", label: "£35,000", amountMinor: 35_000_00, recommended: true, note: "Recommended — full enablement to sell and deliver." },
      { id: "50000", label: "£50,000", amountMinor: 50_000_00, note: "Extended onboarding — multi-team enablement and co-branded material." },
    ],
    tierLegend: "Choose your onboarding",
    currency: "gbp",
    kind: "onboarding",
    group: "partner",
    online: true,
    providers: ["stripe", "gocardless"],
    priceLabel: "£25,000–£50,000 onboarding",
    statusLabel: "Online payment enabled",
    gateNote: "Partnership approval required before payment.",
    buyers: ["MSSP Leadership", "Consultancy Practice Lead", "Head of Cyber / Assurance", "Channel & Alliances Director"],
    blurb:
      "A strategic onboarding engagement that prepares an MSSP, consultancy, or assurance firm to sell and deliver Runtime Governance before introducing it to customers. Covers technical architecture review, deployment and integration planning, sales enablement, and co-branded material. Not a discount on enterprise pricing — customer engagements continue through the standard ladder.",
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
  if (!tierId) return defaultTier(service) as DepositTier;
  return service.tiers.find((t) => t.id === tierId) ?? null;
}

/** The tier pre-selected on the card: the recommended one, else the lowest. */
export function defaultTier(service: ServiceDef): DepositTier | undefined {
  return service.tiers?.find((t) => t.recommended) ?? service.tiers?.[0];
}
