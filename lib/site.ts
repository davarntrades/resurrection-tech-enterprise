/** Central site constants, nav, and SEO defaults. */

export const SITE = {
  name: "Resurrection Tech™",
  legalName: "Resurrection Tech Ltd",
  domain: "resurrection-tech.com",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://resurrection-tech.com",
  tagline: "Admissible Operating Envelopes for Autonomous Systems",
  description:
    "Resurrection Tech defines, tests, and enforces Admissible Operating Envelopes for autonomous systems through independent, pre-execution runtime governance and bounded reachability evidence.",
  patent: "GB2600765.8",
  keywords: [
    "Admissible Operating Envelope",
    "Safety Envelope",
    "Local AI Safety",
    "Runtime Governance",
    "AI Governance",
    "Reachability-Based Safety",
    "Autonomous Systems Governance",
    "Pre-Execution Enforcement",
    "Runtime Assurance",
    "AI Safety Infrastructure",
  ],
} as const;

// Top-level navigation. Deliberately short: six destinations, each a
// distinct depth of the same story (architecture → platform → deployment →
// proof → integration → company). Everything else lives one tap away under
// Menu. The conversion actions are the CTAs, not nav links.
export const NAV_LINKS = [
  { href: "/technology", label: "Technology" },
  { href: "/guardian-os", label: "Guardian OS" },
  { href: "/guardian-os/sovereign", label: "Sovereign" },
  { href: "/evidence", label: "Evidence" },
  { href: "/developers", label: "Developers" },
  { href: "/company", label: "Company" },
] as const;

// Full enterprise IA — rendered in the drop-down menu (desktop + mobile).
// Each destination appears exactly once; grouped by intent.
export const NAV_MENU = [
  {
    group: "Product",
    links: [
      { href: "/guardian-os", label: "Guardian OS™" },
      { href: "/guardian-os/sovereign", label: "Guardian OS Sovereign" },
      { href: "/ai-twin", label: "Your AI Twin™" },
      { href: "/intelligence-packs", label: "Industry Intelligence Packs" },
      { href: "/sovereign-intelligence-packs", label: "Sovereign Intelligence Packs" },
      { href: "/#what", label: "Runtime Governance™" },
      { href: "/why-runtime-governance", label: "Why Runtime Governance" },
      { href: "/technology", label: "Technology & architecture" },
      { href: "/solutions", label: "Industries & solutions" },
      { href: "/integrations", label: "How it integrates" },
      { href: "/developers", label: "Developers" },
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
      { href: "/enterprise-runtime-governance-assessment", label: "Enterprise Runtime Governance Assessment™" },
      { href: "/pilot", label: "Pilot scope of work" },
      { href: "/pay", label: "Payments & invoicing" },
      { href: "/book", label: "Book a consultation" },
    ],
  },
  {
    group: "Partner & licensing",
    links: [
      { href: "/partner-portal", label: "Partner Portal" },
      { href: "/strategic-alliance-partner", label: "Strategic Alliance Partner™" },
      { href: "/managed-governance-partner", label: "Managed Governance Partner™" },
      { href: "/embedded-runtime-governance-licensing", label: "Embedded Runtime Governance Licensing™" },
      { href: "/design-partners", label: "Design Partner Program" },
      { href: "/referral", label: "Partner referrals" },
    ],
  },
  {
    group: "Evidence",
    links: [
      { href: "/evidence", label: "Validation results" },
      { href: "/case-studies", label: "Case studies" },
      { href: "/sample-audit", label: "Sample audit report" },
      { href: "/sample-executive-report", label: "Sample executive report" },
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
