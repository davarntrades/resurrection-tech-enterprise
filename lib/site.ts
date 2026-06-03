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

// Curated links shown inline in the desktop navbar — conversion-focused, no jargon.
export const NAV_LINKS = [
  { href: "/why-runtime-governance", label: "Why us" },
  { href: "/integrations", label: "Integrations" },
  { href: "/evidence", label: "Evidence" },
  { href: "/enterprise-pathways", label: "Pricing" },
] as const;

// Full enterprise IA — rendered in the menu panel (desktop + mobile), in
// mobile priority order. Technical concepts live under "Technology" only.
export const NAV_MENU = [
  {
    group: "Solutions",
    links: [
      { href: "/#what", label: "Runtime Governance™" },
      { href: "/why-runtime-governance", label: "Why Runtime Governance" },
      { href: "/integrations", label: "How it integrates" },
      { href: "/enterprise-pathways", label: "Runtime Safety Assessment" },
      { href: "/pay", label: "Pricing & engagements" },
    ],
  },
  {
    group: "Who it's for",
    links: [
      { href: "/why-runtime-governance", label: "Executives — CEO / CFO / CRO" },
      { href: "/integrations", label: "Technical leaders — CTO / CISO" },
      { href: "/security", label: "Risk & compliance" },
      { href: "/test-trajectory", label: "AI & engineering teams" },
      { href: "/#domains", label: "Target sectors" },
    ],
  },
  {
    group: "Evidence",
    links: [
      { href: "/live-demo", label: "Live Demo" },
      { href: "/evidence", label: "Validation results" },
      { href: "/case-studies", label: "Case studies" },
      { href: "/security", label: "Security & deployment" },
      { href: "/sample-audit", label: "Sample audit report" },
      { href: "/test-trajectory", label: "Test a trajectory" },
    ],
  },
  {
    group: "Technology",
    links: [
      { href: "/#middleware", label: "Runtime Governance architecture" },
      { href: "/#reachability", label: "Reachability & Ω" },
      { href: "/#reachability", label: "Safety as Geometry™" },
      { href: "/#threats", label: "Threat coverage" },
      { href: "/#model", label: "Morrison Framework™" },
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
