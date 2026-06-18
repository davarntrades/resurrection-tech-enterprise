# Runtime Governance — Colab notebooks

Two self-contained Colab notebooks.

## 1. Hugging Face planner → Runtime Governance smoke test

`hf_planner_governance_smoke_test.ipynb` — proves the end-to-end pattern with a
**real Hugging Face open-weight model** as the planner:

```
real HF planner (Qwen/Qwen2.5-0.5B-Instruct)
  → proposes a JSON tool trajectory
    → Runtime Governance pre-execution check (POST /v1/evaluate)
      → PERMIT / ESCALATE / BLOCK
        → blocked / escalated trajectories never execute.
```

The model is the **planner only** — it never executes a tool. The verdict comes
from the real `/v1/evaluate` engine (PERMIT / ESCALATE / BLOCK). Three workflows
are exercised (safe internal summary, external data egress, high-value unverified
finance transfer), plus a "test your own task" cell. A clearly-labelled local
**mock** lets you run the whole harness offline before connecting the endpoint;
on any endpoint error the client **fails closed** (treats it as `BLOCK`).

**Open in Colab:**
https://colab.research.google.com/github/davarntrades/resurrection-tech-enterprise/blob/main/examples/colab/hf_planner_governance_smoke_test.ipynb

Config (cell 1): set `GOVERNANCE_URL` and `GOVERNANCE_TOKEN` (env var, Colab
Secret `GOVERNANCE_TOKEN`, or pasted). It defaults to live mode. Cell **1b** runs
a **preflight auth check** (`/health` + a minimal `/v1/evaluate` probe) so a
`401 Unauthorized` is caught and explained *before* the scenarios.

Auth / transport handling:
- Sends `Authorization: Bearer <token>` when a token is set.
- Only an HTTP **200** is treated as a governance verdict. `401` (bad/missing
  token), `404` (wrong path), `500` (server), and timeouts are **failed closed**
  (BLOCK, `source=transport_error`) and are **not** counted as live validations.
- The final report prints `LIVE-ENGINE VALIDATIONS: n/3` and only passes when all
  three came back from the real engine (`source=live`).
- The planner parser rejects duplicate `trajectory` keys and retries, so earlier
  tool calls are never silently dropped.

## 2. Live API test (public proxies)

A self-contained notebook that exercises the **live** Resurrection Tech Runtime
Governance engine through the **public website proxies** — no API keys, no
private tokens.

**Open in Colab:**
https://colab.research.google.com/github/davarntrades/resurrection-tech-enterprise/blob/main/examples/colab/runtime_governance_colab.ipynb

It will:
1. Send sample **finance / cybersecurity / healthcare** tool manifests to
   `/api/assess` (Ω exposure assessment) and print the full JSON + a summary table.
2. Send sample trajectories for **ALLOW / ESCALATE / BLOCK** to
   `/api/evaluate-trajectory` (the public proxy that calls the real engine).
3. Print every full JSON response.
4. Render a clean table: **scenario · domain · expected · actual · reason ·
   latency · engine · pass/fail**.
5. Give you a cell to **paste your own agent flow** (manifest + trajectory) and
   test it immediately.

Endpoints used (public, no auth):
- `https://resurrection-tech.com/api/assess`
- `https://resurrection-tech.com/api/evaluate-trajectory`

Notes:
- The proxy reports the engine's third verdict as the human-review state
  `INCONCLUSIVE`; the notebook normalises it to **ESCALATE**.
- `engine = source`: `morrison` is the real engine; `heuristic` is the local
  fallback used only if the engine is briefly unreachable.
- Nothing you paste is executed — the engine only inspects the proposed JSON and
  returns a deterministic verdict before any tool runs.

Full copy-paste integration guide: https://resurrection-tech.com/quickstart
