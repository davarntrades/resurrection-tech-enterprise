# Connect Your Agent — Runtime Governance Integration Guide

**Morrison Runtime Governance™ · Resurrection Tech™**
Enterprise onboarding · Limited Pilot

Runtime Governance evaluates every action your AI agents attempt **before it executes**, and
returns `ALLOW` / `ESCALATE` / `BLOCK`. You insert **one layer** in front of tool execution.
You do not rebuild your agent, retrain a model, or change your infrastructure.

---

## 1. Prerequisites

| You need | Provided by |
|---|---|
| An **ingest API key** (issued once at onboarding) | Resurrection Tech |
| Your **environment endpoint** (hosted or in-VPC) | Resurrection Tech |
| The ability to make an outbound **HTTPS POST** before a tool runs | Your engineering team |
| The list of **tools** your agent can call (a manifest — OpenAI functions, MCP, LangChain, Bedrock, or JSON) | Your team (used to scope your Ω coverage) |

No SDK is required. Any language that can make an HTTPS request can integrate.

---

## 2. API Endpoint

```
POST https://resurrection-tech.com/api/runtime/evaluate
Content-Type: application/json
Authorization: Bearer <YOUR_INGEST_KEY>
```

Supporting read endpoints (same base URL, same Bearer auth):

| Endpoint | Purpose |
|---|---|
| `GET /api/runtime/metrics` | Live counters, latency, rule/Ω frequency, trends |
| `GET /api/runtime/decisions?...&format=csv` | Searchable decision history + evidence export |
| `GET /api/runtime/reports?period=monthly` | Governance evidence reports |
| `GET /api/runtime/health` | Platform + engine health (public, no customer data) |

---

## 3. Authentication

Every request carries your key in the `Authorization` header:

```
Authorization: Bearer rtk_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

- Keys are **scoped to one environment** (e.g. your `production`) and one role.
- The **ingest** role can submit trajectories and read your own evidence. A **viewer** key can read
  evidence only.
- Keys are shown **once** at issuance and stored only as a salted hash on our side. Rotate or revoke
  at any time by contacting us — revocation is immediate.

---

## 4. Example Request / Response

**Request** — submit the action your agent is about to take as a one-step *trajectory*:

```bash
curl -X POST https://resurrection-tech.com/api/runtime/evaluate \
  -H "Authorization: Bearer $RT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "trajectory": [
      { "tool": "transfer_funds", "args": { "destination_account": "EXT-9931", "amount": 480000 } }
    ],
    "domains": ["finance"],
    "agent": "billing-agent-v3",
    "correlation_id": "req-8c21"
  }'
```

- `trajectory` *(required)* — an ordered array of `{ tool, args }` steps. For a single pending call,
  send one step. For lookahead, send the planned sequence.
- `domains` *(optional)* — Ω domains to weight (e.g. `["finance"]`); inferred if omitted.
- `agent`, `label`, `correlation_id` *(optional)* — your own tags for filtering evidence later.

**Response:**

```json
{
  "ok": true,
  "verdict": "ALLOW",
  "engine_verdict": "BLOCK",
  "mode": "shadow",
  "enforced": false,
  "requires_human_review": false,
  "omega_domain": "finance",
  "rule": "unbounded_external_value_transfer",
  "reason": "Transfer to an unrecognised external account exceeds the autonomous limit.",
  "trajectory_hash": "9f2b…",
  "engine_compute_ms": 0.58,
  "round_trip_ms": 41.2,
  "engine_commit": "a1c3f9",
  "ruleset_hash": "77de…",
  "decision_id": "dec_01J…",
  "recorded": true,
  "recorded_at": "2026-07-04T12:41:07.221Z"
}
```

**Reading the response:**

- **`verdict`** — what your agent should do *right now* (`ALLOW` · `ESCALATE` · `BLOCK`).
- **`engine_verdict`** — what governance *actually decided*. In **shadow mode** `verdict` is always
  `ALLOW` (observe-only) while `engine_verdict` shows what *would* have happened in enforcement.
- **`ESCALATE`** + `requires_human_review: true` — route to a human approver instead of executing.
- **`engine_commit` / `ruleset_hash` / `trajectory_hash`** — provenance for audit and deterministic
  replay. Every decision is independently reproducible.

**Integration rule of thumb:** call `/evaluate` immediately **before** executing a tool, and gate on
`verdict`:

```
if verdict == "BLOCK":      refuse / raise
elif verdict == "ESCALATE": send to human approval
else:                       execute the tool
```

---

## 5. Enabling Shadow Mode (default at onboarding)

Your `production` environment is provisioned in **`shadow`** mode from day one — **nothing you do
enables it, and nothing breaks.** In shadow mode:

- Every trajectory is evaluated and **recorded**, with the would-be verdict, Ω domain, rule, and latency.
- `verdict` always returns `ALLOW`, so **your agent's behaviour is unchanged** — governance observes,
  it does not intervene.
- You accumulate real, in-environment evidence of exactly what governance *would* have blocked.

Just start sending traffic to `/evaluate` with your key. That is the entire "enable" step.

---

## 6. Switching from Shadow Mode to Enforcement

When your shadow evidence is convincing, enforcement is turned on by a **single configuration change
to your environment mode** (`shadow → enforce`), performed by Resurrection Tech.

- **No code change on your side. No redeploy. No agent rebuild.**
- The *same* `/evaluate` calls now return authoritative verdicts: `BLOCK` actually blocks, `ESCALATE`
  requires human review, `ALLOW` passes through.
- Fail-closed: if the engine is ever unreachable in enforce mode, actions are **blocked**, not waved through.

> *Operator note (Resurrection Tech): this is `admin.setMode(environmentId, "enforce")` — an instant,
> logged, per-environment flip with a `mode_changed_at` timestamp.*

---

## 7. Rollback Procedure

Rollback is the same flip in reverse — **`enforce → shadow`** — and is **instant**.

- No deployment, no downtime, no change to your agent code.
- Governance immediately reverts to observe-only; your agents continue uninterrupted.
- The switch is timestamped and captured in the audit trail.

Because production defaults to shadow, the safe state is always one flip away.

---

## 8. Expected Latency

- **Engine evaluation is sub-millisecond** — typically ~0.5–1 ms of compute per trajectory
  (`engine_compute_ms` in every response).
- **The added latency per action is one HTTPS round-trip** to the governance endpoint. Deployed
  in-region this is typically low tens of milliseconds; every response reports its own `round_trip_ms`
  so you can measure it against your own SLOs.
- For latency-critical paths, deploy the governance endpoint **inside your VPC / region** to minimise
  network time, or evaluate asynchronously in shadow mode (observation adds nothing to your critical path).

Measure it yourself from day one: `engine_compute_ms` and `round_trip_ms` are in every response.

---

## 9. Evidence & Reports You Receive

Every decision is persisted as **tamper-evident evidence** (hash-chained per environment; any deletion
or alteration is detectable on verification). From your key you get:

| Surface | Contents |
|---|---|
| **Live dashboard** | ALLOW/ESCALATE/BLOCK counters, latency, rule + Ω-domain frequency, trend charts, recent decisions |
| **Decision history** (`/decisions`) | Every evaluated action — searchable by verdict, Ω domain, rule, agent, free text, date range; **CSV/JSON export** |
| **Would-block report** (shadow) | Exactly what *would* have been blocked, before you enforce — your pilot business case |
| **Governance reports** (`/reports`) | Daily / weekly / monthly / quarterly rollups for executive and audit visibility |
| **Deterministic replay** | Any past decision re-run to prove the same verdict + trajectory hash under the same ruleset |
| **Audit trail** | Per-environment hash chain with engine commit + ruleset hash provenance on every entry |

---

## 10. Common Integration Examples

The pattern is identical everywhere: **wrap tool execution with a pre-execution call to `/evaluate`.**
In shadow mode this only records (verdict is always `ALLOW`); in enforce mode the same wrapper
actually gates. Below, `govern(tool, args)` posts to `/evaluate` and returns the verdict.

**Shared helper (Python):**

```python
import os, requests

RT_URL = "https://resurrection-tech.com/api/runtime/evaluate"
RT_KEY = os.environ["RT_KEY"]

def govern(tool, args, domains=None):
    r = requests.post(RT_URL,
        headers={"Authorization": f"Bearer {RT_KEY}"},
        json={"trajectory": [{"tool": tool, "args": args}], "domains": domains or []},
        timeout=8)
    d = r.json()
    return d.get("verdict", "ALLOW"), d  # verdict, full decision
```

**Shared helper (Node / TypeScript):**

```ts
export async function govern(tool: string, args: unknown, domains: string[] = []) {
  const res = await fetch("https://resurrection-tech.com/api/runtime/evaluate", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RT_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ trajectory: [{ tool, args }], domains }),
  });
  const d = await res.json();
  return { verdict: d.verdict ?? "ALLOW", decision: d };
}
```

### OpenAI Agents SDK
Gate inside your tool function (or a shared decorator):

```python
from agents import function_tool

@function_tool
def transfer_funds(destination_account: str, amount: float):
    verdict, _ = govern("transfer_funds",
                        {"destination_account": destination_account, "amount": amount},
                        ["finance"])
    if verdict == "BLOCK":
        raise PermissionError("Blocked by Runtime Governance")
    if verdict == "ESCALATE":
        return {"status": "pending_human_approval"}
    return _do_transfer(destination_account, amount)
```

### LangGraph
Add a governance node before the tool node (or wrap `ToolNode`):

```python
def governance_gate(state):
    call = state["pending_tool_call"]
    verdict, decision = govern(call["name"], call["args"])
    return {"verdict": verdict, "decision": decision}

# route: ALLOW -> tools ; BLOCK -> refuse ; ESCALATE -> human_review
graph.add_conditional_edges("governance_gate",
    lambda s: {"ALLOW": "tools", "BLOCK": "refuse", "ESCALATE": "human_review"}[s["verdict"]])
```

### CrewAI
Wrap the tool's `run` (or subclass `BaseTool`):

```python
from crewai.tools import BaseTool

class GovernedTool(BaseTool):
    def _run(self, **kwargs):
        verdict, _ = govern(self.name, kwargs)
        if verdict == "BLOCK":
            return "Action blocked by Runtime Governance."
        if verdict == "ESCALATE":
            return "Action requires human approval."
        return self._execute(**kwargs)
```

### AutoGen
Register a pre-execution hook / wrap the registered function:

```python
def governed(fn, tool_name, domains=None):
    def wrapper(**kwargs):
        verdict, _ = govern(tool_name, kwargs, domains)
        if verdict == "BLOCK":
            raise PermissionError("Blocked by Runtime Governance")
        return fn(**kwargs)
    return wrapper

# agent.register_function({"transfer_funds": governed(transfer_funds, "transfer_funds", ["finance"])})
```

### Custom Python / Node agent
Call `govern(...)` at the single point where your agent dispatches a tool:

```python
verdict, decision = govern(tool_name, tool_args, domains)
if verdict == "BLOCK":
    audit(decision); raise PermissionError("Blocked by Runtime Governance")
elif verdict == "ESCALATE":
    request_human_approval(decision)
else:
    result = dispatch(tool_name, tool_args)
```

The dispatch site is the *only* place you touch. One layer in; nothing else changes.

---

## Support

Resurrection Tech provides the ingest key, your endpoint, and your dashboard access at onboarding, and
performs the shadow → enforce cutover (and any rollback) on request. For key rotation, VPC deployment,
additional Ω domains, or integration help, contact your Resurrection Tech engagement lead.

*Morrison Runtime Governance™ — governance at the execution boundary, independent of model, provider,
or agent framework.*
