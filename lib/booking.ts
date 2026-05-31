/**
 * Booking + contact configuration for the enterprise meeting workflow.
 *
 * Calendly URLs are configurable per environment via NEXT_PUBLIC_* vars and
 * fall back to the live production booking links, so the CTAs always work.
 */

export type BookingType = "discovery" | "assessment" | "strategy";

export interface BookingSession {
  id: BookingType;
  /** Hash target used to deep-link / focus a card (e.g. /book#strategy). */
  anchor: BookingType;
  title: string;
  duration: string;
  /** One-line summary of the session. */
  description: string;
  /** Lead-in for the audience list. */
  audienceLabel: string;
  audience: string[];
  cta: string;
  /** Resolved Calendly URL. */
  calendlyUrl: string;
}

/** Message shown wherever a Calendly URL has not been configured. */
export const CALENDLY_PENDING = "Calendly link pending configuration.";

/**
 * NEXT_PUBLIC_* vars are statically inlined by Next at build time. Each falls
 * back to the live Calendly link so booking works out of the box, while still
 * being overridable per environment.
 */
export const CALENDLY_URLS: Record<BookingType, string> = {
  discovery:
    process.env.NEXT_PUBLIC_CALENDLY_DISCOVERY ??
    "https://calendly.com/davarn-resurrection-tech/30min",
  assessment:
    process.env.NEXT_PUBLIC_CALENDLY_ASSESSMENT ??
    "https://calendly.com/davarn-resurrection-tech/runtime-safety-assessment",
  strategy:
    process.env.NEXT_PUBLIC_CALENDLY_STRATEGY ??
    "https://calendly.com/davarn-resurrection-tech/enterprise-ai-governance-strategy-session",
};

export const BOOKING_SESSIONS: BookingSession[] = [
  {
    id: "discovery",
    anchor: "discovery",
    title: "Discovery Call",
    duration: "30 minutes",
    description:
      "A short introductory call to discuss your AI governance needs and determine whether Resurrection Tech is a good fit.",
    audienceLabel: "For",
    audience: ["Researchers", "Investors", "Collaborators", "Media"],
    cta: "Book Discovery Call",
    calendlyUrl: CALENDLY_URLS.discovery,
  },
  {
    id: "assessment",
    anchor: "assessment",
    title: "Runtime Safety Assessment",
    duration: "60 minutes",
    description:
      "A structured assessment for organisations exploring runtime safety, AI governance, agent risk, and reachability-based control.",
    audienceLabel: "For organisations evaluating",
    audience: [
      "Autonomous systems",
      "AI agents",
      "Agentic workflows",
      "High-trust deployments",
    ],
    cta: "Book Safety Assessment",
    calendlyUrl: CALENDLY_URLS.assessment,
  },
  {
    id: "strategy",
    anchor: "strategy",
    title: "Enterprise AI Governance Strategy Session",
    duration: "90 minutes",
    description:
      "A deeper strategy session for leadership teams, AI program managers, and technical stakeholders exploring enterprise AI governance and pilot opportunities.",
    audienceLabel: "For",
    audience: [
      "Leadership teams",
      "AI program managers",
      "Technical stakeholders",
      "Enterprise & government",
    ],
    cta: "Book Strategy Session",
    calendlyUrl: CALENDLY_URLS.strategy,
  },
];

/** Reasons surfaced in the conversion / trust panel. */
export const WHY_BOOK: string[] = [
  "Runtime Governance architecture review",
  "Threat exposure assessment",
  "Deployment pathway discussion",
  "Pilot feasibility review",
  "Research collaboration opportunities",
];

export interface ContactRoute {
  label: string;
  description: string;
  email: string;
}

export const CONTACT_ROUTES: ContactRoute[] = [
  {
    label: "General Contact",
    description: "Enquiries & briefings",
    email: "hello@resurrection-tech.com",
  },
  {
    label: "Pilot Programmes",
    description: "Enterprise pilots & deployments",
    email: "pilots@resurrection-tech.com",
  },
  {
    label: "Research & Publications",
    description: "Research collaboration & academia",
    email: "research@resurrection-tech.com",
  },
  {
    label: "Partnerships",
    description: "Strategic & commercial partnerships",
    email: "partnerships@resurrection-tech.com",
  },
  {
    label: "Media & Press",
    description: "Interviews & press enquiries",
    email: "media@resurrection-tech.com",
  },
  {
    label: "General Information",
    description: "Anything else — we'll route it",
    email: "info@resurrection-tech.com",
  },
];
