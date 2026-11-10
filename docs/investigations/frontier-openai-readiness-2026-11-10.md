# OpenAI Frontier connector repair and readiness

This branch builds on draft PR #296 (50375af), preserves its HF repair, and does not activate production.

Existing connector: pinned engine runtime_eval/frontier/openai_planner.py already uses the Responses API. UI/provider registry already support OpenAI. The hosted service requires OPENAI_API_KEY and an exact OPENAI_MODEL. Runtime discovery now retrieves that exact model using the same server credential; configuration alone cannot enable selection. Model visibility does not prove Responses compatibility, billing or successful inference. No model was selected or substituted during this repair.

Path: Frontier UI → authenticated Next.js proxy → authenticated Railway Frontier endpoint → existing OpenAI Responses planner → canonical tool proposals → Morrison local/global kernel checks → action-bound simulator gate → sealed experiment evidence → existing Frontier session store → authenticated Control Room retrieval. This Lab is an inert simulator; it is not a live customer execution deployment. The separate Node runtime gateway also required the verdict repair below.

## Reproduced and repaired offline

- Before repair, calling gateway.normVerdict('NOT_ALLOWED') returned ALLOW. Exact canonical verdicts now replace substring/coercive matching. Unknown, malformed and contradictory verdicts block, including shadow mode. Valid shadow observations remain distinct from active enforcement.
- Before repair, two /v1/govern trajectories differing in a non-deciding step shared a trajectory hash. The new regression failed before repair and passes after hashing the full ordered trajectory. deciding_action_hash remains separate.
- Existing Responses planner reused through a bounded client: explicit official endpoint, timeout, no retries, output budget, sanitized authentication/access/model/quota/rate-limit/network/timeout categories, incomplete/empty response rejection. Provider failures remain PROVIDER_ERROR / NOT_EXERCISED with no execution or containment credit.
- Added idempotent SQL declarations for shadow_observed_only and adjacent observation fields. Not applied or verified in production. This is migration preparation, not proof of production schema compatibility.

## Runtime evidence and blockers

Railway production variable-name inventory contains neither OPENAI_API_KEY nor OPENAI_MODEL. It does contain GOVERNANCE_TOKEN, GOVERNANCE_GATEWAY_SECRET and GOVERNANCE_EVIDENCE_KEY, but OAuth withholds values. Existence cannot establish validity, cross-service matching or signing-key independence.

The owner must securely configure the existing key as OPENAI_API_KEY on Railway service resurrection-tech-enterprise in runtime-governance-prod / production, set OPENAI_MODEL to the exact intended model, and provide an authenticated Railway execution session or authenticated Lab access. A GitHub Actions repository secret is only available to explicitly configured Actions jobs; it is not injected into Railway or Vercel. Do not copy the inference key into browser-exposed configuration. No new key is required by this repair.

The Next.js proxy additionally needs the matching GOVERNANCE_TOKEN and correct GOVERNANCE_URL. Gateway identity forwarding requires matching GOVERNANCE_GATEWAY_SECRET on the relevant frontend/runtime and backend. Decision evidence requires the correct GOVERNANCE_EVIDENCE_KEY and durable store configuration. These relationships have not been verified against live runtime values.

## Verification scope

Service regressions include exact-model discovery, existing Responses parsing and governed safe execution, invalid credentials, unsupported models, quota/rate failures, timeout classification, incomplete responses and provider-error non-crediting. Existing HF, injection, local/global boundary, evidence tampering and session persistence tests remain intact. Controlled SDK fixtures are not live OpenAI inference. No authenticated hosted Lab-to-Control Room write/read was completed.

No merge or deployment performed. PR #296 remains a dependency. Production readiness is UNSUPPORTED until actual schema application, credential matching, real inference, model-generated proposal enforcement and hosted evidence persistence/retrieval are independently checked. Shadow readiness and enforcement readiness are both UNCERTAIN; the passing local gateway veto tests do not establish hosted readiness.
