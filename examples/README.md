# Morrison Runtime Governance — runnable integration examples

Working, copy-paste examples that gate tool execution with a real pre-execution
governance check. Every example does the same thing — **evaluate the proposed
tool call(s) before they run, and refuse to execute on `BLOCK` / `ESCALATE`** —
shown in four common stacks.

```
Agent / Planner ──▶ Morrison Runtime Governance ──▶ ALLOW / BLOCK ──▶ Tool execution
                    (POST /v1/evaluate)              (verdict)         (only on ALLOW)
```

These examples call the governance HTTP service (`governance-service/`). They do
**not** require the engine locally.

## Setup

```bash
export GOVERNANCE_URL="https://resurrection-tech-enterprise-production.up.railway.app"
export GOVERNANCE_TOKEN="<your token>"   # omit if the service has auth disabled
```

| Example | File | Extra deps |
|---|---|---|
| Generic HTTP (stdlib only) | `http_generic.py` | none |
| LangChain | `langchain_guard.py` | `langchain` (only to run the agent; the guard itself is stdlib) |
| LangGraph | `langgraph_guard.py` | `langgraph` |
| MCP client | `mcp_guard.py` | your MCP client lib |
| Hugging Face planner smoke test | `hf_planner_smoke_test.py` | `transformers`, `torch`, `accelerate`, `requests` |
| Hugging Face planner (Colab) | `colab/hf_planner_governance_smoke_test.ipynb` | runs in Google Colab |

### Hugging Face planner → governance smoke test

`hf_planner_smoke_test.py` (and its Colab notebook) prove the full pattern with a
**real open-weight model** as the planner: a small Hugging Face instruct model
(`Qwen/Qwen2.5-0.5B-Instruct`) proposes a JSON tool trajectory, the trajectory is
sent to the real `/v1/evaluate`, and only a `PERMIT` proceeds — `ESCALATE` and
`BLOCK` never execute. Three workflows are exercised (safe internal summary,
external data egress, high-value unverified finance transfer). A clearly-labelled
local mock lets you run it offline first:

```bash
pip install transformers torch accelerate requests
python examples/hf_planner_smoke_test.py --mock          # offline, mock verdicts
python examples/hf_planner_smoke_test.py                 # real planner + real /v1/evaluate
```

Run the dependency-free one first to confirm connectivity:

```bash
python examples/http_generic.py
# → BLOCK  cybersecurity/credential_exfiltration  (layer A_safe)
```

## Design notes (production-style)

- **Fail-closed:** if the service errors or times out, treat it as "do not
  execute" (these examples raise). Choose your own policy (block vs. degrade).
- **Stateless:** the check is a pure function of the proposed trajectory.
- **Pre-execution:** the verdict is obtained *before* any tool runs.
- **Model-agnostic:** the guard sits at the tool-dispatch boundary, not inside
  the model.

See `/enterprise` and `/integrations` on the website for the architecture and
the engine's verdict/field reference.
