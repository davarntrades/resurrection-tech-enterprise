# Resurrection Tech™ — Partner FAQ

Companion to the Partner Portal (`/partner-portal`). Answers are indicative and
non-binding; final terms are confirmed during partnership discovery and
commercial review. Runtime Governance is a pre-execution governance layer:
every proposed agent action is evaluated and resolved to **ALLOW / BLOCK /
ESCALATE** before it executes.

---

## A. General (1–22)

1. **What does Resurrection Tech actually sell?** Runtime governance infrastructure, evidence, deployment support, monitoring, updates, and commercial rights to use the governance layer — not unrestricted source code.
2. **What is Runtime Governance in one sentence?** A pre-execution control that blocks an agent action if its reachable trajectory intersects forbidden states (Ω).
3. **How is this different from logging or observability?** Logging records what already happened; Runtime Governance decides before the action runs.
4. **How is it different from guardrails/prompt filters?** Guardrails constrain text; Runtime Governance governs *actions and tool calls* against reachable outcomes.
5. **Why do enterprises need it?** Autonomous agents now reach payments, customer data, infrastructure, and regulated workflows; pre-execution control is becoming a deployment requirement.
6. **Why does a partnership make sense?** Partners already own the customer relationship, the security mandate, or the platform — and add governed AI without building the technology.
7. **Who are partners?** MSSPs, cybersecurity and AI consultancies, systems integrators, cloud consultancies, compliance and risk firms, enterprise software and OEM vendors, MSPs, resellers, channel and strategic alliance partners.
8. **Do customers keep working with us or with Resurrection Tech?** With you, in Managed and Channel models — governance runs behind the scenes.
9. **Who owns the technology?** Resurrection Tech retains ownership of the engine, governance logic, IP, updates, and infrastructure regardless of deployment location.
10. **Can we white-label?** Yes, under embedded/OEM licence; white-label, exclusivity, and territory are set during partnership discovery.
11. **Can we embed it in our own product?** Yes — see Embedded Runtime Governance Licensing™.
12. **Do you sell direct as well?** Yes; deal registration and named-account exclusions protect partner-sourced deals.
13. **What does a customer experience?** Their agents run as normal; unsafe actions are blocked or escalated before execution, and they receive monthly executive reports.
14. **What are the expected customer outcomes?** Safe agent deployment, board-ready evidence, faster compliance, and prevented incidents.
15. **What is Ω (Omega)?** The set of forbidden/catastrophic states the system must never reach; governance keeps reachable trajectories disjoint from Ω.
16. **Is this AI that judges AI?** No — it is deterministic, reachability-based evaluation, not a model grading another model.
17. **What frameworks are supported today?** LangChain, OpenAI Agents SDK, Anthropic tool use, AWS Bedrock, Azure AI, MCP (roadmap-forward), and custom frameworks via adapters.
18. **What if our customer uses a custom framework?** A thin adapter normalises its tool calls into one contract; anything that can POST over HTTPS can connect.
19. **How mature is the product?** It runs as a live governance service with benchmark, validation, and replay/attestation evidence available under NDA.
20. **Is there a free way to evaluate?** Yes — a free Day-1 assessment maps a tool manifest to an Ω exposure view in minutes.
21. **How do we get started?** Book a discovery call; we then scope onboarding and a go-to-market plan.
22. **Where is the single source of truth?** This portal — `/partner-portal`.

---

## B. Technical (23–44)

23. **How long does integration take?** It varies with hook quality, auth model, streaming vs request/response, and deployment constraints; stacks close to our contract integrate quickly, others take longer. We scope each as an engineering estimate, not a fixed timeline.
24. **What does integration require?** An adapter that maps the framework's tool-execution hook to the governance API, plus auth and a fail-mode decision.
25. **What deployment options exist?** Hosted API, customer cloud (AWS/Azure/GCP), private cloud, on-prem, embedded SDK, and network proxy/sidecar.
26. **Which is the default?** The hosted API — fastest to validate and deploy.
27. **Can customers stay on the hosted API indefinitely?** Yes; they can also migrate to customer-hosted or private deployment later.
28. **How does authentication work?** API keys for hosted; environment-appropriate auth (keys, OAuth, mTLS) for customer-hosted/private.
29. **What is the latency impact?** Engine decisions are sub-millisecond; the practical cost is the network round-trip, minimised by embedded/private deployment for latency-sensitive flows.
30. **What happens if the governance API is unavailable?** Fail-mode (fail-open vs fail-closed) is an explicit, configurable governance decision, with health checks and fallbacks.
31. **Is data sent to Resurrection Tech?** In the hosted model, proposed actions are evaluated via the API; in customer/private/embedded deployments, evaluation runs in the customer's environment.
32. **What data is required to evaluate an action?** The proposed tool call, its arguments/capabilities, and enough trajectory context to assess reachability.
33. **What evidence is collected?** A tamper-evident audit trail of every decision plus the metrics that power executive reports.
34. **Is the audit trail verifiable?** Yes — decisions are recorded with replay/attestation so a run can be reproduced and tamper-checked.
35. **Do you support streaming agents?** Yes; streaming vs request/response affects the adapter, which we account for in scoping.
36. **Can we run it air-gapped?** Private/on-prem deployment supports restricted and disconnected environments, subject to update handling.
37. **How are governance rules (Ω) defined?** Engine defaults plus deployment-specific rules; Resurrection Tech owns and updates the governance logic.
38. **Can customers customise Ω?** Deployment rules are configured with the customer during onboarding; the core engine and logic remain RT-owned.
39. **How are updates delivered?** Hosted updates are continuous; customer-hosted/embedded receive versioned governance updates under the licence.
40. **What about MCP and agent SDKs?** MCP and agent-SDK adapters are on the roadmap; hosted-API integration and framework adapters are available today.
41. **What languages/SDKs are supported for embedded?** Embedded integration is scoped per environment during technical fit.
42. **How do you handle versioning and schema drift?** Adapters are versioned; the verdict contract is stable so framework changes are isolated to the adapter.
43. **What are the system requirements for private deployment?** Determined during architecture review based on throughput, latency, and residency needs.
44. **How is security handled?** Least-privilege access, encrypted transport, no storage of unnecessary payload data, and audit-trail integrity.

---

## C. Commercial (45–66)

45. **How does the commercial model work?** Typically partner onboarding (one-time), annual platform access, and per-customer commercial bands, with a minimum annual commitment; specifics depend on the model.
46. **Is onboarding a discount?** No — it is strategic enablement that prepares a partner to sell and deliver. Customer engagements continue through the standard ladder, unchanged.
47. **What does onboarding cost?** Managed Governance Partner onboarding is £25K–£50K (recommended £35K).
48. **What is the annual platform access band?** £25K–£75K+/yr for Managed Governance Partners, plus per-customer bands.
49. **What is the embedded/OEM licence?** From £100K+/yr plus a minimum annual guarantee, by commercial review.
50. **When does commercial review apply?** Enterprise Integration, embedded/OEM/enterprise licensing, white-label, exclusivity, territory, and large-scale or sovereign deployments.
51. **When do annual commitments apply?** Ongoing platform access, licensing, and embedded models carry a minimum annual commitment.
52. **Who invoices the customer?** In Managed and Channel models, the partner invoices and owns the relationship; other models vary by agreement.
53. **How do renewals work?** The partner leads renewals; monthly executive reports provide the supporting evidence.
54. **How do executive reports fit commercially?** Included with Managed Governance Partner™, Limited Pilot™, Enterprise Integration™, and Annual Licence engagements — not priced separately.
55. **What margin do resellers earn?** Channel margin is set by agreement, with deal registration and named-account terms.
56. **What do alliance/referral partners earn?** Commission on realised revenue, no fee to join, with time-boxed deal registration.
57. **Is there commission on existing pipeline?** No commission is paid on already-active pipeline.
58. **Is exclusivity available?** Never automatic; time-boxed, against a minimum annual guarantee, carved out for direct and named accounts.
59. **How are pilots priced?** Limited Pilot is £250K–£750K+ depending on complexity, integration surface, and sector.
60. **How is the audit priced?** Runtime Governance Audit is £40K–£75K (one-time).
61. **What is the annual licence range?** Annual Runtime Governance Licence™ is £75K–£500K+/yr.
62. **Is there an advisory retainer?** Yes — £35K–£100K+/mo for ongoing governance evolution and oversight.
63. **Can pricing be co-termed with the customer's contract?** Yes, subject to commercial review.
64. **What payment methods are supported?** Invoice is standard for enterprise; online deposits/retainers via card or bank debit where applicable.
65. **What are the standard contract protections?** Usage reporting, audit rights, deployment boundaries, and IP ownership are retained by Resurrection Tech.
66. **How do we expand an account over time?** Hosted API → private deployment → annual licence → enterprise/OEM, with executive reports compounding renewal and expansion.

---

*This is a living document and is extended over time. For anything not covered, contact your Resurrection Tech representative.*
