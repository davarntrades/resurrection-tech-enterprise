# GuardianOS Integration Gateway

The Integration Gateway is the enterprise onboarding layer around the existing
GuardianOS Runtime Governance platform. It does not replace authentication,
Runtime APIs, the engine, evidence, Enterprise Memory, the Operations Agent, or
the customer lifecycle.

## Trust boundary

1. A customer authenticates with an existing hashed GuardianOS API credential.
2. The API resolves one organisation and, where applicable, one environment.
3. Fine-grained scopes and expiry are checked.
4. Runtime events reuse `/api/runtime/evaluate`.
5. Gateway mutations become Operations proposals.
6. Runtime Governance evaluates the proposal.
7. Only an `ALLOW` can execute the registered action.
8. The proposal, decision, execution verification and evidence ID remain linked.

Plaintext API keys are shown once and never stored. Connector secrets and webhook
signing secrets are AES-256-GCM encrypted using `INTEGRATION_SECRET_KEY`.
Short-lived encrypted hand-off records keep plaintext secrets out of proposal
params, execution records, logs and evidence.

## Quick start

Onboarding creates production, staging and sandbox environments. Production and
sandbox credentials are returned once. Use the sandbox credential first:

```bash
curl https://resurrection-tech.com/api/runtime/evaluate \
  -H "Authorization: Bearer rtk_test_..." \
  -H "Content-Type: application/json" \
  -d '{"trajectory":[{"tool":"read_account","args":{}}],"domains":["finance"]}'
```

The generated OpenAPI 3.1 reference is served at:

```text
/api/integration/v1/openapi
```

`GET /api/integration/v1/sandbox` returns the customer’s test environment,
sample policies, example requests, SDK snippets and connector examples. The
sandbox deliberately uses the real Runtime Governance authority in shadow mode:
it simulates enforcement without creating a second “mock” engine whose outcomes
could drift from production.

## Official SDKs

TypeScript:

```ts
import { GuardianOS } from "@resurrection-tech/guardianos";

const guardian = new GuardianOS({ apiKey: process.env.GUARDIANOS_API_KEY! });
const decision = await guardian.evaluate({
  trajectory: [{ tool: "transfer_funds", args: { amount: 2500 } }],
  domains: ["finance"],
});
```

Python:

```python
from guardianos import GuardianOS

with GuardianOS(api_key=os.environ["GUARDIANOS_API_KEY"]) as guardian:
    decision = guardian.propose("transfer_funds", {"amount": 2500}, ["finance"])
```

Both SDKs expose `evaluate`, `propose`, `submitEvidence`/`submit_evidence`,
`getDecision`/`get_decision`, `getOrganisation`/`get_organisation`,
`createDeployment`/`create_deployment`,
`submitRuntimeEvent`/`submit_runtime_event`, and
`retrieveAuditTrail`/`retrieve_audit_trail`.

## Credential scopes

- `runtime:read`, `runtime:write`
- `integrations:read`, `integrations:manage`
- `webhooks:read`, `webhooks:manage`
- `credentials:read`, `credentials:manage`
- `deployments:read`, `deployments:manage`
- `evidence:read`, `evidence:write`

Credentials can be restricted to an environment, expired, rotated without an
availability gap, and revoked. Rotation issues the replacement first and only
then revokes the previous credential.

## Webhook signatures

Deliveries include:

- `x-guardian-event`
- `x-guardian-timestamp`
- `x-guardian-signature: v1=<hex HMAC-SHA256>`

Verify the HMAC over `<timestamp>.<raw request body>` using the one-time signing
secret. Reject stale timestamps. Payload capture is off by default; when enabled
per webhook, delivery history can include the payload for inspection.

## Error model

- `400`: invalid request or environment boundary
- `401`: missing, invalid, expired or revoked credential
- `403`: missing scope or operation blocked by Runtime Governance
- `404`: resource absent or outside the authenticated organisation
- `202`: governed operation is awaiting approval
- `429`: rate limit exceeded
- `500/503`: storage, schema or runtime dependency failure

## Deployment models

The same module and schema run in Platform, Managed Service, Private Cloud,
Sovereign and Air-Gapped profiles. Cloud storage remains disabled by the
existing sovereign profile boundary. Internal HTTP/private endpoints require
explicit deployment flags and are never enabled silently.

## Production configuration

Apply `supabase/integration_gateway.sql`, then configure:

```text
INTEGRATION_SECRET_KEY=<high-entropy deployment secret>
INTEGRATION_WEBHOOK_TIMEOUT_MS=10000
```

Private/on-prem installations may explicitly set
`INTEGRATION_ALLOW_PRIVATE_ENDPOINTS=1`. HTTP endpoints additionally require
`INTEGRATION_ALLOW_HTTP=1`.

## Amazon Bedrock

The first-class `aws-bedrock` connector adds governed Bedrock Runtime,
Converse/streaming APIs, IAM role assumption, credential validation and
Bedrock Agent action-group mapping without changing the Runtime Governance
engine. See [AWS-BEDROCK-CONNECTOR.md](./AWS-BEDROCK-CONNECTOR.md).

## Evidence gaps are never silent

Evidence is written *after* an outcome has already been decided. A store fault
at that point must not fail the caller a second time — that would turn an
evidence outage into an availability outage — so `submitEvidenceOrFlag()`
swallows the error and the governed path continues unchanged.

What it does **not** do is stay quiet. Losing the record of a BLOCK is exactly
the thing an auditor asks about ("prove you blocked it"), so an evidence gap is
made as loud as a lost decision, matching the decision path in
`lib/runtime/gateway.js`:

- a structured `connector_evidence_record_failed` error event, naming the
  connector, proposal and outcome whose evidence was lost;
- a counter, via the same `log` ring the health endpoint reports;
- a `record_failure` alert — already classified **critical** — attributed to
  the organisation and environment.

Enforcement is unaffected: the caller still receives the refusal. Only the
observability of the gap changes.

`scripts/runtime/evidence-gap-observability.test.cjs` pins this, including a
guard that fails if any evidence write reverts to a bare
`.catch(() => {})`.

## Verifiable evidence hashes

Every connector evidence record carries `evidence_hash`, and the audit
projection **recomputes it from the stored row**. A mismatch is reported as a
`critical` finding in the monthly pack rather than passing silently.

The hash is taken over a **canonical** serialisation — object keys sorted
recursively, array order preserved. This matters because Postgres `jsonb` does
not preserve key order. A hash taken over insertion-order JSON cannot be
recomputed after a round trip, so verifying it would report ordinary,
untampered evidence as altered — worse than not verifying at all.

Verification is therefore **three-valued**, never two:

| State | Meaning |
|---|---|
| `verified` | recomputed hash matches; the payload is byte-for-byte what was recorded |
| `unverifiable` | written before canonical hashing (`evidence_hash_alg` is NULL). The hash is retained but cannot be independently recomputed. **Never reported as tampered** |
| `mismatch` | recomputed hash differs — the payload has been altered since it was written |

`evidence_hash_alg` records which algorithm produced the stored hash, so only
records that *can* be verified are verified. A legacy serialisation and a real
alteration are indistinguishable, and an audit trail that guesses in the
accusing direction is worse than one that admits what it cannot prove.

### Known limit

Connector evidence is hashed **per record, not chained**. An altered record is
detected; deleting an entire record is not, because there is no sequence to
break. Only decisions (`rg_decisions`) are hash-chained. `AU-9` in
`lib/sovereign/controls.js` states this limit explicitly.

### Deployment

```bash
psql "$SUPABASE_DB_URL" -f supabase/evidence_hash_canonical.sql
```

Additive, idempotent, no backfill. Historical evidence is never rewritten.
