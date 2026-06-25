/** Central site constants, nav, and SEO defaults. */

export const SITE = {
  name: "Resurrection Tech™",
  legalName: "Resurrection Tech Ltd",
  domain: "resurrection-tech.com",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://resurrection-tech.com",
  tagline: "Runtime Governance for Autonomous Systems",
  description:
    "Resurrection Tech identifies, constrains, embeds, and monitors runtime governance boundaries for autonomous systems — preventing catastrophic reachable states before execution.",
  patent: "GB2600765.8",
  keywords: [
    "Runtime Governance",
    "AI Governance",
    "Reachability-Based Safety",
    "Autonomous Systems Governance",
    "Runtime Assurance",
    "AI Safety Infrastructure",
  ],
} as const;

// Curated links shown inline in the desktop navbar. Kept short and free of
// duplication — "Assess your agent" lives in the primary CTA; the full index is
// one tap away under Menu.
export const NAV_LINKS = [
  { href: "/live-demo", label: "Live Demo" },
  { href: "/integrations", label: "Integrations" },
  { href: "/enterprise-pathways", label: "Pricing" },
  { href: "/referral", label: "Partner Referrals" },
] as const;

// Full enterprise IA — rendered in the drop-down menu (desktop + mobile).
// Each destination appears exactly once; grouped by intent.
export const NAV_MENU = [
  {
    group: "Product",
    links: [
      { href: "/#what", label: "Runtime Governance™" },
      { href: "/why-runtime-governance", label: "Why Runtime Governance" },
      { href: "/integrations", label: "How it integrates" },
      { href: "/quickstart", label: "Developer quickstart" },
      { href: "/enterprise", label: "Enterprise readiness" },
    ],
  },
  {
    group: "Try it",
    links: [
      { href: "/assessment", label: "Assess your agent" },
      { href: "/live-demo", label: "Live demo" },
      { href: "/test-without-agent", label: "Test without your own agent" },
      { href: "/assess", label: "Ω exposure — upload a manifest" },
      { href: "/test-trajectory", label: "Test a trajectory" },
    ],
  },
  {
    group: "Engage",
    links: [
      { href: "/enterprise-pathways", label: "Enterprise pathways & pricing" },
      { href: "/request-audit", label: "Request an audit" },
      { href: "/pilot", label: "Pilot scope of work" },
      { href: "/pay", label: "Payments & invoicing" },
      { href: "/design-partners", label: "Design Partner Program" },
      { href: "/managed-governance-partner", label: "Managed Governance Partner™" },
      { href: "/referral", label: "Partner referrals" },
      { href: "/book", label: "Book a consultation" },
    ],
  },
  {
    group: "Evidence",
    links: [
      { href: "/evidence", label: "Validation results" },
      { href: "/case-studies", label: "Case studies" },
      { href: "/sample-audit", label: "Sample audit report" },
      { href: "/compliance", label: "EU AI Act & compliance" },
      { href: "/security", label: "Security & deployment" },
    ],
  },
  {
    group: "Company",
    links: [
      { href: "/company", label: "About Resurrection Tech™" },
      { href: "/partners", label: "Partners" },
      { href: "/licensing", label: "Licensing" },
      { href: "/contact", label: "Contact" },
    ],
  },
] as const;

export const CALENDLY = {
  discovery: process.env.NEXT_PUBLIC_CALENDLY_DISCOVERY ?? "",
  assessment: process.env.NEXT_PUBLIC_CALENDLY_ASSESSMENT ?? "",
  strategy: process.env.NEXT_PUBLIC_CALENDLY_STRATEGY ?? "",
} as const;
