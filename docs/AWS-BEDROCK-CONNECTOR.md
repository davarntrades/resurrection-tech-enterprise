# GuardianOS Amazon Bedrock connector

The `aws-bedrock` connector is a first-class adapter inside the existing
GuardianOS Integration Gateway. It does not replace Runtime Governance:

```text
Bedrock request → GuardianOS proposal → Runtime Governance
                → PERMIT / BLOCK / ESCALATE → AWS call or refusal → evidence
```

AWS is called only after the proposal reaches `executed`. A block, unresolved
escalation, malformed request, environment mismatch, organisation mismatch, or
unavailable governance service fails closed before an AWS SDK call.

## 1. Prepare a least-privilege IAM role

Prefer a dedicated role with temporary STS credentials. Scope `Resource` to the
models and inference profiles the customer has approved:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InvokeApprovedBedrockModels",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:eu-west-2::foundation-model/PROVIDER.MODEL-ID",
        "arn:aws:bedrock:eu-west-2:123456789012:inference-profile/PROFILE-ID"
      ]
    }
  ]
}
```

The source identity used by GuardianOS additionally needs only
`sts:AssumeRole` for the connector role. The role trust policy should name that
source identity and use an external ID for cross-account deployments:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::GUARDIAN-ACCOUNT:role/GuardianOSGateway" },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": { "sts:ExternalId": "CUSTOMER-GENERATED-EXTERNAL-ID" }
    }
  }]
}
```

Do not attach `AdministratorAccess` or `AmazonBedrockFullAccess`. Add only the
model or inference-profile ARNs that the workload needs.

## 2. Create the connector

Create it in the sandbox environment first through the Control Room, or use the
existing connector API:

```bash
curl -X POST https://resurrection-tech.com/api/integration/v1/connectors \
  -H "Authorization: Bearer $GUARDIANOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "aws-bedrock",
    "name": "London Bedrock",
    "environment_id": "env_sandbox_...",
    "config": {
      "region": "eu-west-2",
      "auth_method": "role",
      "role_arn": "arn:aws:iam::123456789012:role/GuardianOSBedrock",
      "model_ids": ["PROVIDER.MODEL-ID"],
      "agent_ids": ["AGENTID"],
      "agent_aliases": ["ALIASID"],
      "action_groups": ["GovernedOperations"],
      "timeout_ms": 30000,
      "max_retries": 2
    },
    "secret": {
      "access_key_id": "OPTIONAL-SOURCE-KEY",
      "secret_access_key": "OPTIONAL-SOURCE-SECRET",
      "session_token": "OPTIONAL-SESSION-TOKEN",
      "external_id": "CUSTOMER-GENERATED-EXTERNAL-ID"
    }
  }'
```

When GuardianOS runs with an AWS workload identity, source access keys may be
omitted. Static access-key authentication is supported for deployments that
cannot assume a role, but role-based temporary credentials are preferred.

Connector credentials are staged and AES-256-GCM encrypted by the existing
Integration Gateway secret model. Plaintext credentials are never placed in a
proposal, log, response, dashboard row or evidence record.

## 3. Validate health and rotate credentials

```bash
curl -X POST https://resurrection-tech.com/api/integration/v1/bedrock \
  -H "Authorization: Bearer $GUARDIANOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "validate",
    "connector_id": "int_...",
    "environment_id": "env_sandbox_..."
  }'
```

Validation calls STS `GetCallerIdentity`; role connectors first call
`AssumeRole`. The Control Room then shows the AWS account identifier, region,
authentication method, health, last success and redacted activity.

Rotate credentials with `operation: "rotate_credentials"` and a replacement
`credentials` object. GuardianOS validates the replacement before atomically
replacing the encrypted secret. A failed validation leaves the prior encrypted
credential in place.

## 4. Runtime invocation

TypeScript:

```ts
const result = await guardian.integrations.bedrock.invokeModel({
  connector_id: "int_...",
  environment_id: "env_sandbox_...",
  request: {
    mode: "converse",
    model_id: "PROVIDER.MODEL-ID",
    messages: [{ role: "user", content: [{ text: "Summarise this incident." }] }],
    inference_config: { maxTokens: 300, temperature: 0.2 }
  }
});
```

Python:

```python
result = guardian.integrations.bedrock.invoke_model(
    connector_id="int_...",
    environment_id="env_sandbox_...",
    request={
        "mode": "converse",
        "model_id": "PROVIDER.MODEL-ID",
        "messages": [{"role": "user", "content": [{"text": "Summarise this incident."}]}],
    },
)
```

`mode: "converse"` uses the installed AWS SDK’s `ConverseCommand`;
`mode: "invoke"` uses `InvokeModelCommand`. Set `stream: true` to use
`ConverseStreamCommand` or `InvokeModelWithResponseStreamCommand`. The Gateway
normalises the returned stream events before sending them to the SDK caller.
Model providers are not hard-coded. An inference-profile ARN can be supplied as
`inference_profile`.

## 5. Bedrock Agent action groups

The adapter accepts the Lambda-compatible Bedrock Agent event shape:

```json
{
  "messageVersion": "1.0",
  "agent": { "id": "AGENTID", "alias": "ALIASID", "name": "OperationsAgent", "version": "1" },
  "sessionId": "session-123",
  "actionGroup": "GovernedOperations",
  "apiPath": "/payments",
  "httpMethod": "POST",
  "parameters": [{ "name": "amount", "type": "number", "value": "25000" }]
}
```

GuardianOS preserves the agent, alias, action group, path, method, parameter
names, session and organisation/environment boundary. Parameter values and
request bodies are mapped for execution but evidence uses hashes and metadata.

The response is a Bedrock-compatible action-group response with
`guardian_decision` set to `PERMIT`, `BLOCK` or `ESCALATE`. Only `PERMIT` allows
the customer adapter to call its business handler.

### Lambda adapter

```ts
import { GuardianOS } from "@resurrection-tech/guardianos";

const guardian = new GuardianOS({ apiKey: process.env.GUARDIANOS_API_KEY! });

export const handler = async (event: Record<string, unknown>) => {
  const governed = await guardian.integrations.bedrock.handleActionGroup({
    connector_id: process.env.GUARDIANOS_BEDROCK_CONNECTOR_ID!,
    environment_id: process.env.GUARDIANOS_ENVIRONMENT_ID!,
    event
  });

  // Never call the business action on BLOCK or unresolved ESCALATE.
  if (governed.decision !== "ALLOW") return governed.bedrock_response;

  // Execute the approved business action here, then return its result using
  // the same Bedrock action-group response envelope.
  return governed.bedrock_response;
};
```

For a public Lambda-to-GuardianOS route, set
`require_inbound_signature: true` and store an
`inbound_signing_secret` in the connector secret. Send:

- `x-guardian-aws-timestamp`
- `x-guardian-aws-nonce`
- `x-guardian-aws-signature: v1=<HMAC-SHA256>`

The HMAC input is `<timestamp>.<nonce>.<raw-request-json>` where the raw request
is the complete JSON body sent to `/api/integration/v1/bedrock`. GuardianOS
rejects stale timestamps, invalid signatures and reused nonces. Private
deployments can also keep the adapter behind IAM-authenticated network
infrastructure.

## 6. Sandbox walkthrough

1. Use the organisation’s `rtk_test_...` credential.
2. Create the connector against the sandbox environment.
3. Run credential validation.
4. Invoke a mocked/non-sensitive prompt with an approved model ID.
5. Send one action-group event expected to permit.
6. Send one policy-sensitive event expected to block or escalate.
7. Confirm the blocked/escalated request caused no downstream execution.
8. Inspect the Integration Gateway’s Bedrock activity and Evidence Hub.
9. Create a separate staging connector and repeat.
10. Create production credentials only after the evidence and IAM scope are
    accepted.

## Troubleshooting

| Code | Meaning | Resolution |
|---|---|---|
| `AWS_INVALID_CREDENTIALS` | STS rejected the credential | Rotate the source credential or session token |
| `AWS_ROLE_ASSUMPTION_FAILED` | Role trust, external ID or `sts:AssumeRole` failed | Check the trust policy and source principal |
| `AWS_REGION_MISMATCH` | ARN region differs from connector region | Use the matching regional connector |
| `AWS_ACCESS_DENIED` | IAM lacks the requested model permission | Add only the required model/profile ARN |
| `AWS_THROTTLED` | Bedrock throttled after bounded retries | Retry with backoff or request quota |
| `AWS_MODEL_NOT_READY` | Model temporarily unavailable | Retry after the connector backoff |
| `GOVERNANCE_BLOCKED` | Runtime Governance denied the proposal | Inspect the linked evidence and rule |
| `GOVERNANCE_ESCALATED` | Human decision remains unresolved | Resolve the existing proposal; do not execute |
| `GOVERNANCE_UNAVAILABLE` | GuardianOS could not obtain a decision | Restore Runtime Governance; the request failed closed |
| `AWS_REPLAY_DETECTED` | Signed nonce was reused | Generate a new nonce and timestamp |

This connector is validated in CI with mocked AWS SDK clients. Live AWS
connectivity must be validated separately with customer-owned credentials,
approved model access, IAM trust and the customer’s selected region.
