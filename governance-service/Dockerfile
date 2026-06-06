# Morrison Runtime Governance service.
# The engine is pure-Python; we vendor it from the public repo at a pinned ref.
FROM python:3.12-slim

WORKDIR /app

# Pin the engine to a specific commit/tag for reproducible verdicts.
ARG ENGINE_REPO=https://github.com/davarntrades/Morrison-Runtime-Governance.git
# Pinned to the Omega-Sector expansion (PR #9) + sector authorisation-awareness
# fix (PR #10, 2026-06-05): adds the eight sector OmegaDomain enum values that
# the deployment sector_rules.py / website resolve, and honours domain-scoped
# verification flags (payee_verified, operator_confirmed, ...). Bump
# deliberately so verdicts stay reproducible.
ARG ENGINE_REF=96ecd39528072057f37ab8975c203171cc12aa53

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
 && rm -rf /tmp/engine

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py finance_rules.py coverage_rules.py domain_rules.py sector_rules.py ./

ENV PORT=8000 \
    GOVERNANCE_EVAL_TIMEOUT_S=4.0 \
    GOVERNANCE_HORIZON=3 \
    LOG_LEVEL=INFO

EXPOSE 8000

# Container-level healthcheck hits the warm default layer.
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,os,sys; sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/health').status==200 else 1)"

CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
