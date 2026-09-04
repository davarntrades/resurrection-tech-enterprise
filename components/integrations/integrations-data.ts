/* ============================================================
   Integration matrix data.

   Every entry here is backed by something in this repository. The
   status tier says exactly what that backing is, so the matrix
   cannot be read as claiming a native integration or an
   endorsement that does not exist.

     reference  — a guard implementation ships in examples/
     governed   — wired into the integration-gateway runtime
     custody    — a credential backend the gateway can read from
     surface    — a destination class the boundary sits in front
                  of, reached over the generic HTTP contract

   `surface` entries are deliberately unnamed at the vendor level.
   Naming a product there would imply an adapter that is not in
   this codebase.
   ============================================================ */

export type IntegrationStatus = "reference" | "governed" | "custody" | "surface";

export interface Integration {
  id: string;
  label: string;
  status: IntegrationStatus;
  /** Where the boundary sits for this entry. */
  boundary: string;
  /** What backs the claim, in this repository. */
  evidence: string;
  /** Path to the artefact, where one is browsable. */
  href?: string;
}

export interface IntegrationGroup {
  id: string;
  title: string;
  note: string;
  items: readonly Integration[];
}

export const STATUS_LABEL: Record<IntegrationStatus, string> = {
  reference: "Reference guard",
  governed: "Governed execution",
  custody: "Credential custody",
  surface: "Destination class",
};

export const STATUS_NOTE: Record<IntegrationStatus, string> = {
  reference: "A working guard implementation ships in this repository.",
  governed: "Wired into the integration-gateway runtime with recorded evidence.",
  custody: "A credential backend the gateway reads signed material from.",
  surface: "Reached over the generic HTTP contract. No vendor-specific adapter.",
};

export const GROUPS: readonly IntegrationGroup[] = [
  {
    id: "orchestrators",
    title: "Orchestrators",
    note: "The boundary is placed at the plan → act step, before a call is issued.",
    items: [
      {
        id: "mcp",
        label: "MCP",
        status: "reference",
        boundary: "At the client or host, before a call is forwarded.",
        evidence: "examples/mcp_guard.py",
        href: "/developers#adapters",
      },
      {
        id: "langgraph",
        label: "LangGraph",
        status: "reference",
        boundary: "A governance node placed before the tool node.",
        evidence: "examples/langgraph_guard.py",
        href: "/developers#adapters",
      },
      {
        id: "langchain",
        label: "LangChain",
        status: "reference",
        boundary: "A pre-tool guard wrapping each tool once.",
        evidence: "examples/langchain_guard.py",
        href: "/developers#adapters",
      },
      {
        id: "custom",
        label: "Custom orchestrator",
        status: "reference",
        boundary: "One call at the plan → act boundary.",
        evidence: "examples/http_generic.py",
        href: "/developers#surface",
      },
      {
        id: "guard-ts",
        label: "TypeScript guard",
        status: "reference",
        boundary: "Wraps the dispatch function in your own runtime.",
        evidence: "examples/integration/governanceGuard.ts",
        href: "/quickstart",
      },
      {
        id: "guard-py",
        label: "Python guard",
        status: "reference",
        boundary: "Called immediately before the tool executes.",
        evidence: "examples/integration/governance_guard.py",
        href: "/quickstart",
      },
    ],
  },
  {
    id: "providers",
    title: "Model providers",
    note: "Invocation runs through proposal, authorization, approval and evidence before the provider is called.",
    items: [
      {
        id: "bedrock",
        label: "AWS Bedrock",
        status: "governed",
        boundary: "Provider invocation, after authorization and any approval.",
        evidence: "Governed invocation console with recorded latency and evidence.",
        href: "/runtime/admin/bedrock-invocations",
      },
      {
        id: "openai",
        label: "OpenAI",
        status: "governed",
        boundary: "Provider invocation, after authorization.",
        evidence: "Provider execution path in the integration-gateway runtime.",
      },
      {
        id: "vertex",
        label: "Google Vertex AI",
        status: "governed",
        boundary: "Provider invocation, after authorization.",
        evidence: "Provider execution path in the integration-gateway runtime.",
      },
    ],
  },
  {
    id: "custody",
    title: "Credential custody",
    note: "Where signed policy and provider credentials are held. The signing key stays outside the protected environment.",
    items: [
      { id: "aws-sm", label: "AWS Secrets Manager", status: "custody", boundary: "Credential read at gateway start.", evidence: "Credential adapter in the sovereign runtime." },
      { id: "azure-kv", label: "Azure Key Vault", status: "custody", boundary: "Credential read at gateway start.", evidence: "Credential adapter in the sovereign runtime." },
      { id: "gcp-sm", label: "Google Secret Manager", status: "custody", boundary: "Credential read at gateway start.", evidence: "Credential adapter in the sovereign runtime." },
      { id: "vault", label: "HashiCorp Vault", status: "custody", boundary: "Credential read at gateway start.", evidence: "Credential adapter in the sovereign runtime." },
      { id: "k8s", label: "Kubernetes Secrets", status: "custody", boundary: "Credential read at gateway start.", evidence: "Credential adapter in the sovereign runtime." },
      { id: "local", label: "Encrypted local", status: "custody", boundary: "Air-gapped profile — no external secret store.", evidence: "Signed local bundle, verified with Ed25519.", href: "/guardian-os/sovereign#guarantees" },
    ],
  },
  {
    id: "destinations",
    title: "Execution destinations",
    note: "Classes of state-changing action the boundary sits in front of. Reached over the generic contract — no vendor-specific adapter is claimed.",
    items: [
      { id: "d-finance", label: "Payment & treasury", status: "surface", boundary: "Before a transfer, payment or refund is issued.", evidence: "Finance Ω domain in the governed test suite." },
      { id: "d-identity", label: "Identity & access", status: "surface", boundary: "Before a permission or role change is applied.", evidence: "Privilege-escalation coverage in the test suite." },
      { id: "d-data", label: "Regulated data stores", status: "surface", boundary: "Before regulated data leaves an approved boundary.", evidence: "Healthcare and data-privacy Ω domains." },
      { id: "d-cloud", label: "Cloud infrastructure", status: "surface", boundary: "Before an infrastructure state change is applied.", evidence: "Cybersecurity Ω domain in the test suite." },
      { id: "d-comms", label: "Messaging & email", status: "surface", boundary: "Before an outbound message is sent.", evidence: "Communication adapters in the runtime." },
      { id: "d-http", label: "Any HTTP endpoint", status: "surface", boundary: "One authorization call before the request is issued.", evidence: "examples/http_generic.py", href: "/developers#surface" },
    ],
  },
];

/** Flat list, in matrix order. */
export const ALL_INTEGRATIONS: readonly Integration[] = GROUPS.flatMap((g) => g.items);
