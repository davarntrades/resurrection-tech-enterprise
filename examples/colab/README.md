# Runtime Governance — Live API Test (Google Colab)

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
