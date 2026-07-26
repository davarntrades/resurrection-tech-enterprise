# GuardianOS Sovereign Readiness

## Scope

This additive layer defines reusable contracts for provider endpoint overrides, customer-controlled credential resolution, deployment-mode validation, outbound authorization, secret redaction and customer-controlled evidence storage. It does not replace Runtime Governance, proposal execution, approval resolution, tenant isolation, existing connector APIs or evidence schemas.

## Trust boundaries

1. Runtime Governance remains the authority that must reach an executed proposal before provider execution.
2. Connector credentials are resolved locally through a configured provider and are never included in public configuration, evidence or errors.
3. Every GuardianOS-originated network request must be authorized before the network client is called.
4. Evidence is written through a deployment-selected store with organisation and environment ownership checks.
5. Sovereign mode rejects mandatory Resurrection Tech control-plane, telemetry or remote-evidence dependencies at startup.

## Configuration

| Variable | Purpose | Sovereign default |
|---|---|---|
| `GUARDIANOS_DEPLOYMENT_MODE` | `hosted`, `private`, or `sovereign` | `sovereign` when selected |
| `GUARDIANOS_OUTBOUND_POLICY` | `none`, `approved_endpoints_only`, or `custom` | `approved_endpoints_only` |
| `GUARDIANOS_ALLOW_HTTP_ENDPOINTS` | Allows explicitly configured HTTP endpoints for isolated development networks | disabled |
| `INTEGRATION_ALLOW_PRIVATE_ENDPOINTS` | Enables private endpoint addresses | enabled by sovereign mode |
| `GUARDIANOS_EXTERNAL_EVIDENCE_DELIVERY` | Opt-in external evidence delivery outside sovereign mode | disabled |
| `GUARDIANOS_TELEMETRY_ENABLED` | Opt-in telemetry outside sovereign mode | disabled |

## Provider endpoint configuration

First-class connector configuration may supply `provider_endpoints` or `endpoints` with service-specific URLs.

- AWS Bedrock: `runtime`, `agent_runtime`, `sts`
- Azure: `openai`, `ai_foundry`, `identity`
- Google Vertex AI: `vertex`, `gemini`, `identity`

HTTPS is required by default. Embedded URL credentials and fragments are rejected. Private endpoints are accepted only in an explicitly private or sovereign deployment.

## Credential providers

Implemented and directly usable:

- encrypted local storage (existing Integration Gateway mechanism)
- deployment-injected environment secrets
- customer-defined callback provider

Contract-defined and requiring provider SDK/customer-environment integration before a live claim:

- AWS Secrets Manager
- Azure Key Vault
- Google Secret Manager
- HashiCorp Vault
- Kubernetes Secrets

The registry resolves on every request, allowing rotation and refresh without application restart.

## Outbound policy

`none` denies every outbound request before network execution. `approved_endpoints_only` permits only configured origins/path prefixes. `custom` delegates to a customer-local policy function. An optional Runtime Governance callback can require an executed governance proposal after destination-policy approval and before the network call.

Denied requests expose only safe destination and purpose metadata. Secrets are redacted from nested objects, bearer values and AWS access-key patterns.

## Evidence custody

The evidence-store contract requires `write` and `find` operations. The local Runtime store adapter checks both `org_id` and `environment_id` before writing or reading. Sovereign defaults disable external export, webhook delivery and remote replication. Existing evidence schemas and APIs remain unchanged.

## Deployment models and limitations

- Private cloud, sovereign cloud, government cloud and on-premises deployments are supported by configuration contracts.
- Disconnected and air-gapped governance operation is supported when no external provider execution is required.
- External cloud-model calls are not possible in a fully air-gapped environment unless the provider is reachable through a customer-controlled private route.
- Secret-manager adapters are contract-tested abstractions; live provider validation requires the customer's identity, network and secret-store environment.
- Azure and Google connector execution wiring must be validated against their first-class connector implementations before being marked directly proven.

## Validation classification

| Capability | Classification |
|---|---|
| Endpoint parsing and rejection rules | Implemented and contract-tested |
| AWS/Azure/Google service endpoint model | Implemented and mocked in CI |
| Environment/custom credential providers | Implemented and contract-tested |
| Enterprise secret-manager definitions | Contract-tested; customer-environment validation required |
| Outbound deny-before-network behaviour | Implemented and contract-tested |
| Sovereign startup dependency rejection | Implemented and contract-tested |
| Local evidence ownership enforcement | Implemented and contract-tested |
| Live AWS PrivateLink/Azure Government/Vertex private endpoint | Customer-environment validation required |

## Sovereign readiness checklist

- [x] Customer endpoint abstraction implemented
- [x] Customer-controlled credential abstraction implemented
- [x] No mandatory Resurrection Tech control plane in sovereign policy
- [x] Deny-before-network outbound enforcement contract-tested
- [x] Local evidence-store boundary and tenant checks contract-tested
- [x] Organisation isolation maintained by evidence adapter
- [x] Environment isolation maintained by evidence adapter
- [x] Existing APIs remain unchanged
- [ ] All first-class connector execution paths wired to the shared abstractions
- [ ] Complete existing suite and live-provider validation recorded
