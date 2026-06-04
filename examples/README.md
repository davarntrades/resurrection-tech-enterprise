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
