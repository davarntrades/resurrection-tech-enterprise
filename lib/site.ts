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

// Curated links shown inline in the desktop navbar.
export const NAV_LINKS = [
  { href: "/#what", label: "Platform" },
  { href: "/integrations", label: "Integrations" },
  { href: "/test-trajectory", label: "Runtime Demo" },
  { href: "/evidence", label: "Evidence" },
  { href: "/enterprise-pathways", label: "Pathways" },
  { href: "/pay", label: "Pay" },
] as const;

// Full, grouped index — rendered in the menu panel (the complete site map,
// available on both desktop and mobile via the menu button).
export const NAV_MENU = [
  {
    group: "Platform",
    links: [
      { href: "/#what", label: "What we do" },
      { href: "/why-runtime-governance", label: "Why Runtime Governance" },
      { href: "/integrations", label: "How it integrates" },
      { href: "/#reachability", label: "Ω Reachability" },
      { href: "/test-trajectory", label: "Runtime demo" },
      { href: "/#roi", label: "ROI / cost of failure" },
    ],
  },
  {
    group: "Evidence & trust",
    links: [
      { href: "/case-studies", label: "Case studies" },
      { href: "/evidence", label: "Evidence & methodology" },
      { href: "/security", label: "Security & deployment" },
      { href: "/sample-audit", label: "Sample audit report" },
    ],
  },
  {
    group: "Engage",
    links: [
      { href: "/enterprise-pathways", label: "Enterprise pathways" },
      { href: "/company", label: "Company" },
      { href: "/partners", label: "Partners" },
      { href: "/licensing", label: "Licensing" },
      { href: "/pay", label: "Payments & invoicing" },
      { href: "/contact", label: "Contact" },
      { href: "/book", label: "Book a meeting" },
    ],
  },
] as const;

export const CALENDLY = {
  discovery: process.env.NEXT_PUBLIC_CALENDLY_DISCOVERY ?? "",
  assessment: process.env.NEXT_PUBLIC_CALENDLY_ASSESSMENT ?? "",
  strategy: process.env.NEXT_PUBLIC_CALENDLY_STRATEGY ?? "",
} as const;
