# Morrison Runtime Governance service.
# The engine is pure-Python; we vendor it from the public repo at a pinned ref.
FROM python:3.12-slim

WORKDIR /app

# Pin the engine to a specific commit/tag for reproducible verdicts.
ARG ENGINE_REPO=https://github.com/davarntrades/Morrison-Runtime-Governance.git
# Pinned to PR #12 (2026-08-07): deterministic ruleset hash, single-step
# sensitive-egress guard, fail-closed tenancy — on top of PR #11 which added
# morrison_governance.kernel — the trust boundary (authority quarantine, signed
# approval artifacts bound to a canonical action hash), semantic capability
# classification, trusted destination resolution, denial-aware trajectory
# history, hash-chained evidence with a logic-binding ruleset hash, and
# independent Ed25519 attestation. app.py imports it, so this ref MUST include
# it — the build-time `import app` check below fails loudly otherwise.
#
# Previously: 4fafc68 (governance kernel PR #11); before that 96ecd39 (PR #9 + sector
# authorisation-awareness PR #10). Bump deliberately so verdicts stay
# reproducible.
ARG ENGINE_REF=8c6ce45c810959a6e2df4af61f813b711fd4e9a8

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Vendor the pure-Python engine package onto the import path.
# ENGINE_REF may be a commit SHA, tag, or branch — so clone then checkout
# (a `--branch` clone only accepts branch/tag names, never a commit SHA).
RUN git clone --filter=blob:none --no-checkout "${ENGINE_REPO}" /tmp/engine \
 && git -C /tmp/engine checkout "${ENGINE_REF}" \
 && git -C /tmp/engine rev-parse HEAD > /app/engine_commit.txt \
 && cp -r /tmp/engine/morrison_governance /app/morrison_governance \
 && cp -r /tmp/engine/runtime_eval /app/runtime_eval \
 && rm -rf /tmp/engine

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# NOTE: this list is explicit, so a NEW runtime module must be added here or the
# image builds without it. kernel_config.py is imported by app.py at module
# scope; attest.py is the offline evidence auditor, shipped so an operator can
# verify an exported chain from inside the container.
COPY app.py frontier_api.py frontier_sessions.py vllm_frontier_planner.py assess.py finance_rules.py coverage_rules.py domain_rules.py sector_rules.py cyber_rules.py healthcare_rules.py operations_rules.py dynamic_rules.py policy_bundle.py ed25519_verify.py escalation.py kernel_config.py attest.py ./

# ── Sovereign deployment (Phase 6) ──────────────────────────────────────────
# A cloud image is built exactly as before: POLICY_BUNDLE/TRUST_BUNDLE are empty,
# nothing is copied, and the engine reads policies from the control plane.
#
# A SOVEREIGN image bakes the signed policy bundle and the trust store into the
# layer, so the running container needs no network, no database and no mounted
# volume to enforce customer policy:
#
#   docker build -f governance-service/Dockerfile \
#     --build-arg POLICY_BUNDLE=dist/acme-policies \
#     --build-arg TRUST_BUNDLE=dist/trust \
#     -t guardian-engine:acme-1.0.0 .
#   docker run --network none -e GUARDIAN_PROFILE=air_gapped guardian-engine:acme-1.0.0
#
# The bundle is verified at RUN TIME as well as build time — baking it in is a
# delivery convenience, never a reason to skip a signature check.
ARG POLICY_BUNDLE=""
ARG TRUST_BUNDLE=""
COPY ${POLICY_BUNDLE:-requirements.txt} /app/policy-bundle-src
COPY ${TRUST_BUNDLE:-requirements.txt} /app/trust-src
RUN if [ -n "${POLICY_BUNDLE}" ]; then mv /app/policy-bundle-src /app/policy-bundle; else rm -rf /app/policy-bundle-src; fi \
 && if [ -n "${TRUST_BUNDLE}" ]; then mv /app/trust-src /app/trust; else rm -rf /app/trust-src; fi

# Fail the image build if app.py or any of its runtime imports is absent from
# Railway's production import root. This runs from WORKDIR=/app, the same
# directory used by the uvicorn start command below.
RUN python -c "import pathlib; import app; assert pathlib.Path(app.__file__).parent == pathlib.Path('/app')"

ENV PORT=8000 \
    GOVERNANCE_EVAL_TIMEOUT_S=4.0 \
    GOVERNANCE_HORIZON=3 \
    LOG_LEVEL=INFO

EXPOSE 8000

# Container-level healthcheck hits the warm default layer.
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,os,sys; sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/health').status==200 else 1)"

# Keep the Railway-managed HF_MODELS allowlist and append a small curated set of
# low-cost hosted planners for Frontier stress testing. The list intentionally
# favours models currently exposed through Hugging Face Inference Providers at
# low per-token prices. Existing operator-configured models are preserved.
#
# - DeepSeek-V4-Flash-0731: cheap hosted DeepSeek with tool support on providers.
# - Phi-4-mini-instruct: compact Microsoft 4B model; useful as a small planner.
# - Qwen3-4B-Instruct-2507: very low-cost tool-capable baseline.
# - Qwen3-8B: inexpensive stronger Qwen baseline.
# - gemma-3-12b-it: inexpensive non-Qwen comparison with tool-capable providers.
# - Qwen3.8-27B-Uncensored-FP8: existing optional vLLM refusal-removed target.
CMD ["sh", "-c", "for m in deepseek-ai/DeepSeek-V4-Flash-0731 microsoft/Phi-4-mini-instruct Qwen/Qwen3-4B-Instruct-2507 Qwen/Qwen3-8B google/gemma-3-12b-it orcarouter/Qwen3.8-27B-Uncensored-FP8; do case \",${HF_MODELS:-},\" in *,\"${m}\",*) ;; *) export HF_MODELS=\"${HF_MODELS:+${HF_MODELS},}${m}\" ;; esac; done; uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
