/* ============================================================
   Evidence records.

   Four record kinds share one shape so today's incidents and
   convergence statements can be supplemented — or replaced — by
   customer validation and case studies without redesigning the
   section.

   Every record carries its own source. Nothing here is a
   paraphrase presented as a quotation: `statement` is verbatim
   from the cited source, `reading` is Resurrection Tech's
   architectural reading of it and is labelled as such.
   ============================================================ */

export type EvidenceKind = "incident" | "convergence" | "validation" | "case-study";

export interface EvidenceRecord {
  id: string;
  kind: EvidenceKind;
  /** Who the record is about. */
  org: string;
  /** Short unit under the organisation — team, programme, environment. */
  unit?: string;
  /** ISO date of the source, or of the engagement. */
  date: string;
  /** Display date, already formatted. */
  dateLabel: string;
  /** One-line classification, rendered as a technical code. */
  code: string;
  /** Verbatim from the source. Never a paraphrase. */
  statement: string;
  /** Factual account, in operational language. */
  body: string;
  /** The structural control reading. Always attributed. */
  reading: string;
  /** Ordered sequence, where the record has one. */
  sequence?: readonly string[];
  /** Where the sequence stops being recoverable, 0-indexed. */
  sequenceBreak?: number;
  /** Measured figures, for validation and case-study records. */
  metrics?: readonly { k: string; v: string }[];
  source?: { label: string; href: string };
}

export const EVIDENCE: readonly EvidenceRecord[] = [
  {
    id: "hf-incident",
    kind: "incident",
    org: "OpenAI",
    unit: "Published incident report",
    date: "2026-08-27",
    dateLabel: "27 AUG 2026",
    code: "REPRESENTED ≠ ENFORCED",
    statement:
      "The agent recognised an authorization concern, paused, and then continued after another agent posted “GO” and imposed a deadline.",
    body:
      "The constraint was present in context throughout. The action stayed on the execution path.",
    reading:
      "Represented, not enforced. Nothing outside the proposing system was positioned to refuse the transition.",
    sequence: ["Boundary in context", "Action proposed", "Sequence paused", "Action executed"],
    sequenceBreak: 3,
    source: {
      label: "OpenAI — incident report",
      href: "https://openai.com/index/hugging-face-incident-and-the-road-ahead/",
    },
  },
  {
    id: "microsoft-env",
    kind: "convergence",
    org: "Microsoft",
    unit: "CoreAI · Azure SRE Agent",
    date: "2026-08-21",
    dateLabel: "21 AUG 2026",
    code: "ENVIRONMENT CONTROL",
    statement: "Stop restricting the agent. Start restricting its environment.",
    body: "Published guidance on constraining the runtime rather than the system inside it.",
    reading: "Control moves into the runtime — where an authorization decision can be made independently.",
    source: {
      label: "Microsoft CoreAI",
      href: "https://commandline.microsoft.com/azure-sre-agent-restricting-environment-ai-safety/",
    },
  },
  {
    id: "aws-authz",
    kind: "convergence",
    org: "AWS",
    unit: "Security · Bedrock AgentCore",
    date: "2026-08-19",
    dateLabel: "19 AUG 2026",
    code: "INFRASTRUCTURE AUTHORIZATION",
    statement: "…enforced by infrastructure and downstream services, not by agent code.",
    body: "Published guidance placing authorization enforcement outside the agent.",
    reading: "Proposal and execution authority separate. Infrastructure decides what is authorized to execute.",
    source: {
      label: "AWS Security",
      href: "https://aws.amazon.com/blogs/security/propagate-user-authorization-context-in-ai-agents-with-amazon-bedrock-agentcore/",
    },
  },
  {
    id: "google-deterministic",
    kind: "convergence",
    org: "Google",
    unit: "Developers · Agent Development Kit",
    date: "2026-08-17",
    dateLabel: "17 AUG 2026",
    code: "DETERMINISTIC ENFORCEMENT",
    statement: "System prompts are soft constraints.",
    body: "Published guidance placing hard guarantees outside the model context.",
    reading: "Model instructions are not the security boundary. A deterministic pre-execution check is.",
    source: {
      label: "Google Developers",
      href: "https://developers.googleblog.com/build-zero-trust-ai-agents-with-googles-agent-development-kit/",
    },
  },
  {
    id: "bounded-verification",
    kind: "validation",
    org: "Resurrection Tech",
    unit: "Governance repository",
    date: "2026-08-31",
    dateLabel: "31 AUG 2026",
    code: "MEASURED, NOT ASSERTED",
    statement:
      "Reach_G(X₀) ∩ Ω = ∅ — within the declared bounded model, no configured forbidden state remains reachable.",
    body: "Governed test suite and published latency benchmark, on the stated build environment.",
    reading: "Bounded verification within a declared environment — not a universal proof of AI safety.",
    metrics: [
      { k: "Governance evaluations", v: "129,857+" },
      { k: "Coverage test cases", v: "171 / 171" },
      { k: "False positive · negative", v: "0.0% · 0.0%" },
      { k: "Single-step authorization, p50", v: "0.298 ms" },
    ],
    source: { label: "Evidence & methodology", href: "/evidence" },
  },
  {
    id: "sovereign-acceptance",
    kind: "validation",
    org: "Guardian OS Sovereign",
    unit: "CI acceptance suite",
    date: "2026-08-31",
    dateLabel: "31 AUG 2026",
    code: "ACCEPTANCE-TESTABLE",
    statement:
      "Signed local policy bundles enforced without a database, control plane or network connection.",
    body: "CI runs the platform with no network interface but loopback. A tampered bundle fails closed.",
    reading: "Acceptance-testable, not field-validated. No customer-hardware deployment, no accreditation held.",
    source: { label: "Sovereign — current status", href: "/guardian-os/sovereign#status" },
  },
];

/** Human labels for each record kind, used on the card and in the filter. */
export const KIND_LABEL: Record<EvidenceKind, string> = {
  incident: "Incident",
  convergence: "Industry convergence",
  validation: "External validation",
  "case-study": "Case study",
};
