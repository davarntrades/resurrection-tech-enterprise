# Frontier Containment Lab

`/lab` is an operator-only browser surface over the validated Morrison hosted
frontier harness. It does not implement a second evaluator.

## Execution path

1. The browser sends a bounded provider/model/scenario selection to the
   same-origin Next.js route.
2. `/api/frontier/run` requires the existing signed Runtime Control Room
   operator session, rejects unknown fields, rate-limits the caller and forwards
   only validated configuration to Railway.
3. Railway resolves provider credentials and model allowlists from its own
   environment, then calls `runtime_eval.frontier.experiment.run_experiment()`.
4. The model's native tool calls are normalized and passed to
   `RuntimeGovernanceMiddleware` → `GovernanceKernel` / `GovernanceLayer`.
5. Only `PERMIT` reaches the deterministic simulator. `BLOCK`, `ESCALATE`,
   malformed output and governance exceptions do not.
6. The sealed, credential-scrubbed experiment record returns to the operator.

The CLI remains unchanged and uses the same `run_experiment()` implementation.

## Deployment configuration

On Railway (`governance-service`):

- `GOVERNANCE_TOKEN`
- `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` and/or
  `OPENAI_API_KEY` and `OPENAI_MODEL`
- `HF_TOKEN` and comma-separated `HF_MODELS` for Hugging Face Inference
  Providers. Model IDs are a server-side allowlist; arbitrary endpoints are
  never accepted. `HF_TEMPERATURE` is optional and defaults to `0`.
  `FRONTIER_PROVIDER_TIMEOUT_S` bounds the remote inference request.
- optional `FRONTIER_MAX_RUNS`, `FRONTIER_MAX_CONTENT_CHARS`,
  `FRONTIER_MAX_TASK_CHARS`, `FRONTIER_TIMEOUT_S`,
  `FRONTIER_RATE_PER_MINUTE`

On Vercel:

- `GOVERNANCE_URL`
- matching `GOVERNANCE_TOKEN`
- existing Runtime Control Room authentication variables
  (`RUNTIME_OPERATOR_PASSWORD` / `RUNTIME_ADMIN_KEY` and
  `RUNTIME_SESSION_SECRET`)
- optional `FRONTIER_UI_RATE_LIMIT` and `FRONTIER_PROXY_TIMEOUT_MS`

Provider keys must never be configured with a `NEXT_PUBLIC_` prefix.

## Evidence and persistence

Every response contains the sealed experiment record and can be downloaded as
sanitized JSON. The UI retains the most recent records in browser session
storage only. No new database was introduced; Railway's filesystem is
ephemeral, so long-term institutional retention should use the existing
evidence-store architecture in a later, separately reviewed change.

## Safety boundary

Custom Test changes only the synthetic user task and untrusted text. It cannot
add tools, endpoints, credentials, shell commands, real HTTP clients, email
clients, payment clients or production data access. The server assigns the same
fixed simulated inventory and existing Morrison policy path.
