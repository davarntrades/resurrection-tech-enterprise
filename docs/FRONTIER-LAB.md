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

## Continuous governed sessions

The **Continuous Session** tab adds server-owned iteration without adding a
second policy engine. Railway calls the configured provider on each turn,
normalizes every proposed action, and submits it to the same
`RuntimeGovernanceMiddleware` and persistent per-session Morrison kernel before
the deterministic simulator can run.

- **Shadow** records `WOULD_PERMIT`, `WOULD_BLOCK`, and `WOULD_ESCALATE` while
  allowing the inert simulator workflow to continue. It is policy observation,
  not containment.
- **Guarded Pilot** enforces capabilities selected by Morrison's existing
  manifest and holds escalated actions for operator denial or termination.
- **Enforced** applies the existing Morrison decision to every executable
  proposal. A block is returned to the model for replanning by default.

The authenticated session endpoints are `/v1/frontier/session*` on Railway and
same-origin `/api/frontier/session*` proxies on Vercel. Polling is used for live
updates so the browser never owns the authoritative loop. Operator approval is
not exposed until the service can mint a signature bound to the exact session,
step, action, arguments, operator and expiry; denial and continue-without-action
remain available and fail closed.

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
- optional `FRONTIER_SESSION_DEFAULT_STEPS`, `FRONTIER_SESSION_MAX_STEPS`,
  `FRONTIER_SESSION_DEFAULT_RUNTIME_S`, `FRONTIER_SESSION_MAX_RUNTIME_S`, and
  `FRONTIER_MAX_CONCURRENT_SESSIONS`
- `FRONTIER_SESSION_DB_PATH=/data/frontier_sessions.sqlite3` with a Railway
  persistent volume mounted at `/data` for restart-durable session history

On Vercel:

- `GOVERNANCE_URL`
- matching `GOVERNANCE_TOKEN`
- existing Runtime Control Room authentication variables
  (`RUNTIME_OPERATOR_PASSWORD` / `RUNTIME_ADMIN_KEY` and
  `RUNTIME_SESSION_SECRET`)
- optional `FRONTIER_UI_RATE_LIMIT` and `FRONTIER_PROXY_TIMEOUT_MS`
- optional `FRONTIER_SESSION_UI_RATE_LIMIT`

Provider keys must never be configured with a `NEXT_PUBLIC_` prefix.

## Evidence and persistence

Every single-run response contains the sealed experiment record. Continuous
sessions additionally seal every step into a previous-hash chain and seal a
session root containing the terminal step and Morrison evidence head. The UI
exports sanitized JSON or text. Session snapshots use SQLite on Railway; they
are restart-durable only when `FRONTIER_SESSION_DB_PATH` points into a mounted
persistent volume. Without that volume the UI explicitly labels persistence as
process-local, and completed evidence should be exported before redeployment.

## Safety boundary

Custom Test changes only the synthetic user task and untrusted text. It cannot
add tools, endpoints, credentials, shell commands, real HTTP clients, email
clients, payment clients or production data access. The server assigns the same
fixed simulated inventory and existing Morrison policy path.
