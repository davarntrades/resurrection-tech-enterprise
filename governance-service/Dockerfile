# Morrison Runtime Governance service.
# The engine is pure-Python; we vendor it from the public repo at a pinned ref.
FROM python:3.12-slim

WORKDIR /app

# Pin the engine to a specific commit/tag for reproducible verdicts.
ARG ENGINE_REPO=https://github.com/davarntrades/Morrison-Runtime-Governance.git
ARG ENGINE_REF=main

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Vendor the pure-Python engine package onto the import path.
RUN git clone --depth 1 --branch "${ENGINE_REF}" "${ENGINE_REPO}" /tmp/engine \
 && cp -r /tmp/engine/morrison_governance /app/morrison_governance \
 && rm -rf /tmp/engine

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py finance_rules.py ./

ENV PORT=8000 \
    GOVERNANCE_EVAL_TIMEOUT_S=4.0 \
    GOVERNANCE_HORIZON=3 \
    LOG_LEVEL=INFO

EXPOSE 8000

# Container-level healthcheck hits the warm default layer.
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,os,sys; sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/health').status==200 else 1)"

CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
