# Frontier Containment Lab: Hugging Face investigation

Status: repair implemented and tested offline; live production verification BLOCKED.

## Confirmed root cause

At enterprise commit `ddd1f55b96827342bcbb33033e7adf02ee5f8e8c`:

- `governance-service/Dockerfile` appends seven checkpoint identifiers at startup, including `Qwen/Qwen3-8B`, regardless of provider availability.
- `frontier_api._provider_config` reports READY solely when a credential and allowlist exist. It does not authenticate, discover routes, or run inference.
- The frontend presents every allowlisted identifier as selectable. `_validate_config` checks allowlist membership only.
- The pinned engine's HuggingFaceFrontierPlanner sends the exact identifier using Hugging Face InferenceClient(provider="auto"). Its tool-enabled conversational request routes through the Hugging Face router; no model substitution was found.

Independent public API observations at 2026-11-10 09:43 UTC:

- `GET https://router.huggingface.co/v1/models`: `Qwen/Qwen3-8B` absent.
- `GET https://huggingface.co/api/models/Qwen/Qwen3-8B?expand=inferenceProviderMapping`: the model repository exists, but the only mapping is featherless-ai, task conversational, status error.

This confirms that the selector advertises a model with no currently live router path. Repository existence and allowlist membership do not establish executability. The reported `model_not_supported` error is consistent with those independently observed routing facts.

The exact authenticated production failure has NOT been independently reproduced. Production credentials are withheld by the connected apps. An unauthenticated call to the actual Railway `/v1/frontier/config` returned HTTP 401. No valid inference response was obtained. Token validity, inference permission, billing, and account-enabled provider preferences remain unverified.

## Complete request path

1. `components/FrontierLabClient.tsx` -> `POST /api/frontier/run` (continuous mode uses `/api/frontier/session`).
2. Next.js authenticates the user and validates the strict schema. `lib/frontier-server.ts` forwards the exact provider and model to the Railway service using server-side GOVERNANCE_TOKEN.
3. Railway `app.py` authenticates `/v1/frontier/run`; `frontier_api.run_frontier` validates configuration, model allowlist, and now model availability before planner creation.
4. `_make_frontier_planner` -> pinned engine `runtime_eval.frontier.provider_registry.make_planner` -> HuggingFaceFrontierPlanner -> `InferenceClient(provider="auto", token=HF_TOKEN)` -> tool-enabled `chat.completions.create(model=<exact selection>)`.
5. The existing explicit Qwen3.8 vLLM route remains separate and is checked against its own configured `/models` endpoint. It is never substituted for Qwen3-8B.
6. Successful responses are parsed into proposals only. `run_experiment` -> RuntimeGovernanceMiddleware -> Morrison local admissibility, global trajectory/continuity checks and independent kernel authority -> action-bound execution gate -> inert simulator.
7. Kernel evidence and the sealed experiment record bind the evaluated proposals, decisions, model identity, and execution results. Service hash checks and evidence projections then feed Lab/Control Room.
8. Provider errors produce PROVIDER_ERROR, final verdict NOT_EXERCISED, no execution, and no Morrison containment credit. The Next.js proxy returns an explicit provider-error response.

## Changes

- Remove unchecked Docker startup model additions. Preserve the Railway-owned HF_MODELS allowlist exactly.
- Add credential-scoped authenticated discovery, exact canonical model identifiers, live tool-capable route checks, a 30-second discovery cache, and forced fresh checks before every single run/session admission.
- Reject unavailable and unknown selections before planner construction. Discovery errors fail closed and expose no raw exceptions or secrets.
- Check the existing explicit vLLM route against the exact advertised model identifier.
- Separate CONFIGURED, authentication, connectivity, catalogue availability, and inference status. Catalogue success is explicitly NOT_VERIFIED for inference; account routing is explicitly unverified.
- Disable unavailable and unknown models in both selectors, enforce the same rule server-side, and provide a refresh control in single-run mode. No automatic model replacement.
- Include record-scoped SUCCEEDED/FAILED inference observations, bound to the sealed evidence hash. Remove unconditional claims that governance stages ran when inference failed.
- Preserve the pinned engine, canonical governance and execution authority. Move blocking admission discovery off the async request loop.
- Add backend and selector regressions and include backend regressions in the existing governance CI gate.

## Models assessed

These are public catalogue observations, NOT verified executable models for this account:

| Identifier from old Docker additions | Live tool-capable catalogue route |
| --- | --- |
| deepseek-ai/DeepSeek-V4-Flash-0731 | Yes |
| deepseek-ai/DeepSeek-V3 | Yes |
| microsoft/phi-4 | No verified tool-capable route (DeepInfra advertises tools=false; Featherless omits capability) |
| Qwen/Qwen3-4B-Instruct-2507 | No entry |
| Qwen/Qwen3-8B | No entry |
| google/gemma-3-12b-it | No entry |
| orcarouter/Qwen3.8-27B-Uncensored-FP8 | No HF router entry; existing separately configured vLLM route unverified |

Models verified executable using the existing production credentials: NONE.

## Verification results

Tests use engine commit `f25d300807b4c9750f0e9df80548e5be79200edb`, exactly matching the production Dockerfile pin.

- Complete governance-service pytest collection: **83 passed**.
- Focused HF availability, Frontier API and continuous sessions: **50 passed** (included in the 83).
- Pinned engine containment, boundary and Round 2 integrity regressions: **97 passed**.
- Frontend model-selector regressions: **4 passed**.
- `npm run typecheck`: passed.
- `git diff --check`: passed.

HF regression tests use the actual HuggingFaceFrontierPlanner with controlled SDK responses, not a replacement governance path. They demonstrate successful exact-model proposal parsing, safe simulator execution, local denial, locally admissible actions denied by global trajectory checks, enforced action binding, sealed record verification and tamper rejection. They also reproduce model_not_supported offline after a successful catalogue preflight, with no governance decision, no execution and no containment credit.

These checks establish offline wiring and regression behavior. They do NOT establish that hosted inference or browser-to-production governance currently works.

## Deployment and blockers

Observed Railway production service: runtime-governance-prod / resurrection-tech-enterprise. Latest existing deployment `7baf5992-0108-461b-8073-362dd314eb87` reported SUCCESS, created 2026-11-10 02:24 UTC. This was the pre-existing deployment, not this repair.

Repair production deployment: NOT PERFORMED. Repair production verification: NOT VERIFIED. Production-ready: NO.

Required to close the investigation:

1. Authenticated execution access to the existing production/staging runtime; do not rotate or expose secrets.
2. Run the selected exact allowlisted model with the existing HF_TOKEN. Confirm permission, account provider routing, billing and tool-response compatibility.
3. Observe a successful real HF response through the hosted Lab, then independently verify local/global decisions, authority, action binding, execution receipt and exported evidence. Include denial and history-dependent global boundary cases; a model refusal alone cannot establish enforcement.
4. Deploy both Next.js and Railway changes through their existing GitHub integrations and verify the resulting deployment commits and authenticated browser-to-backend behavior. Recheck the exact selected model after deployment.

Do not label catalogue discovery or mocked inference as production readiness.
