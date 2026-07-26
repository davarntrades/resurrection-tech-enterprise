# GuardianOS Sovereign Readiness

## Scope

This additive layer defines reusable contracts for provider endpoint overrides, customer-controlled credential resolution, deployment-mode validation, outbound authorization, secret redaction and customer-controlled evidence storage. It does not replace Runtime Governance, proposal execution, approval resolution, tenant isolation, existing connector APIs or evidence schemas.

## Trust boundaries

1. Runtime Governance remains the authority that must reach an executed proposal before provider execution.
2. Connector credentials are resolved locally through a configured provider and are never included in public configuration, evidence or errors.
3. Every migrated GuardianOS-originated network request is authorized before the network or SDK client is constructed.
4. Evidence is written through a deployment-selected store with organisation and environment ownership checks.
5. Sovereign mode rejects mandatory Resurrection Tech control-plane, telemetry or remote-evidence dependencies at startup.

## Provider endpoint configuration

Service-specific endpoint keys are supported for:

- AWS Bedrock: `runtime`, `agent_runtime`, `sts`
- Azure: `openai`, `ai_foundry`, `identity`
- Google Vertex AI: `vertex`, `gemini`, `identity`

HTTPS is required by default. Embedded URL credentials and fragments are rejected. Private endpoints are accepted only in an explicitly private or sovereign deployment.

## Credential providers

Implemented adapters:

- encrypted local storage through the existing Integration Gateway mechanism
- deployment-injected environment secrets
- customer-defined callback providers
- AWS Secrets Manager through an injected AWS SDK client
- Azure Key Vault through an injected `SecretClient`
- Google Secret Manager through an injected client
- HashiCorp Vault through governed HTTP
- Kubernetes Secrets through a read-only mounted filesystem

The registry resolves on every request, allowing rotation and refresh without application restart. Enterprise adapters are contract implementations and still require live customer identity, network and service validation.

## Governed provider execution

The provider runtime checks, in order:

1. the proposal is verified as executed;
2. the customer credential provider resolves successfully;
3. the destination is approved by the outbound policy;
4. only then is the provider client constructed and invoked.

Azure OpenAI, Azure AI Foundry, Azure identity, Vertex AI, Gemini and Google identity execution modules now receive the resolved endpoint and credentials through this runtime. Their provider clients remain dependency-injected because Azure and Google SDKs are not repository dependencies.

The existing AWS Bedrock production connector predates this layer. Complete migration of Bedrock Runtime and STS client construction into the shared provider runtime remains a merge blocker.

## Evidence custody

The evidence-store contract requires `write` and `find` operations. The local Runtime store adapter checks both `org_id` and `environment_id`. Sovereign defaults disable external export, webhook delivery and remote replication. Existing evidence schemas and APIs remain unchanged. Complete wiring of the main Runtime Governance and Integration Gateway evidence call sites remains required before a full containment claim.

## Validation classification

| Capability | Classification |
|---|---|
| Endpoint parsing and rejection rules | Implemented; hermetic tests authored |
| Azure/Google endpoint and credential propagation | Implemented; integration tests authored |
| AWS/Azure/Google secret-manager adapters | Implemented against injected SDK contracts; live customer validation required |
| HashiCorp Vault and Kubernetes mounted secrets | Implemented; live customer validation required |
| Outbound deny-before-client behaviour | Implemented; integration tests authored |
| Sovereign startup dependency rejection | Implemented; contract tests authored |
| Local evidence ownership enforcement | Implemented; contract tests authored |
| Existing AWS Bedrock path migration | Not complete |
| All existing network paths migrated | Not complete |
| Complete regression, typecheck and build results | Pending GitHub Actions |
| Live PrivateLink, Azure Government and Vertex private endpoints | Customer-environment validation required |

## Sovereign readiness checklist

- [x] Customer endpoint abstraction implemented
- [x] Customer-controlled credential abstraction implemented
- [x] Enterprise credential adapters implemented without live-validation claims
- [x] No mandatory Resurrection Tech control plane in sovereign policy
- [x] Deny-before-network provider runtime implemented
- [x] Azure and Google connector execution modules use shared endpoint and credential controls
- [x] CI workflow added for sovereign, connector, typecheck and build checks
- [ ] Existing AWS Bedrock Runtime and STS execution fully migrated
- [ ] Bedrock Agent Runtime outbound execution wired and tested
- [ ] Webhook, callback, telemetry, diagnostics and export call sites fully migrated
- [ ] Main Runtime Governance and Integration Gateway evidence paths use the evidence abstraction
- [ ] Complete regression, typecheck and build suite green
- [ ] Live customer private/sovereign endpoint validation
