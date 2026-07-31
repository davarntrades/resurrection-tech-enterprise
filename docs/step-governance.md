# Step-level Runtime Governance

Govern an agent at **every decision point**, not only where it calls a model.

```
business step → canonical action → proposal → Runtime Governance
  → allow / block / escalate → your code runs (only on allow) → immutable evidence
```

## Why steps, not calls

Provider-level governance asks "may this model be invoked?". Step-level governance
asks "may this agent do this, *given everything it has already done*?".

That distinction matters because catastrophic outcomes are usually reachable through
individually innocuous steps:

| Step | Alone | In sequence |
|---|---|---|
| Read customer record | benign | — |
| Summarise it | benign | — |
| Send the summary externally | benign | **exfiltration** |

A governed session carries the trajectory forward, so every step is judged against
the whole sequence so far. Judging steps in isolation cannot see the third step for
what it is.

## Three calls

```ts
import GuardianOS from "@guardianos/sdk";
const guardian = new GuardianOS({ apiKey: process.env.GUARDIANOS_API_KEY! });

const session = await guardian.openSession({
  environment_id: "env_...",
  workflow: "customer_triage",
  correlation_id: "case-4182",
});

const step = await guardian.evaluateStep({
  session_id: session.id,
  action_id: "gmail.send_email",
  params: { connector_id, message_hash },
});
if (!step.allowed) throw new Error(step.reason ?? "refused");
await sendTheEmail();                       // runs only on a permit

await guardian.closeSession(session.id);    // emits the replayable session evidence
```

```python
from guardianos import GuardianOS, GuardianOSStepBlocked

guardian = GuardianOS(api_key=os.environ["GUARDIANOS_API_KEY"])
session = guardian.open_session(environment_id="env_...", workflow="customer_triage")

step = guardian.evaluate_step(session["id"], "gmail.send_email", {"connector_id": cid})
if not step["allowed"]:
    raise GuardianOSStepBlocked(step)
send_the_email()

guardian.close_session(session["id"])
```

## The minimal change to an existing agent

Wrap the tool once. Every call is then governed, evidenced and replayable, and the
agent's own logic is untouched.

```ts
const tools = {
  sendEmail: guardian.governed(session.id, "gmail.send_email", sendEmail,
    (args) => ({ connector_id, recipient_count: args.to.length })),
  readCrm:   guardian.governed(session.id, "salesforce.read_record", readCrm),
};
// tools.sendEmail(...) now throws unless Runtime Governance permits it.
```

```python
tools = {
    "send_email": guardian.governed(session_id, "gmail.send_email", send_email),
    "read_crm":   guardian.governed(session_id, "salesforce.read_record", read_crm),
}
```

That is the whole integration: one wrap per tool, no change to the agent loop.

## What every step guarantees

| Guarantee | How |
|---|---|
| Creates or attaches to a proposal | Every step runs the existing `ops.proposals` lifecycle |
| Runtime Governance evaluated | Engine verdict on the accumulated trajectory **and** on the action |
| Allow / block / escalate | `verdict`; act only on `allowed === true` |
| Immutable evidence | Per-step evidence, plus session evidence linking them all |
| Replayable | `replaySession()` re-evaluates the recorded trajectory and confirms verdicts and hashes |

Two independent gates apply and the **more restrictive wins**:

1. the proposal's own governance decision (unchanged, authoritative);
2. the accumulated-trajectory reachability check (**deny-only** — it can turn an
   allow into a block, never a block into an allow).

If the trajectory refuses a step whose action alone would have been permitted, the
proposal is created and governed but **withheld**, so no side effect occurs.

## Fail-closed

An unreachable engine blocks. A closed or blocked session refuses further steps. A
blocked step never enters the trajectory, so it cannot poison later evaluations.

## Reusing it for any connector

The middleware is connector-neutral: a step is an `action_id` plus params. Bedrock,
Gmail, Salesforce, ServiceNow and Microsoft 365 all reach governance through the
same `governed()` entry point. Passing `session_id` in a connector call promotes
that invocation into a governed step with no connector change:

```js
await gateway.invokeBedrock({ org_id, environment_id, connector_id, request,
  session_id: session.id });   // now governed as a workflow step
```

Registering a new connector action makes it available to `evaluateStep` immediately —
`lib/ops/actions.js` for the canonical action, `communication-adapters.js` for a
communication provider. No new governance path is ever required.

## API

`POST /api/integration/v1/steps` — `session.open`, `step.evaluate`, `session.close`.
`GET /api/integration/v1/steps?session_id=…&replay=1` — determinism replay.

`step.evaluate` returns **200** on a permit and **409** on a refusal, so a client that
ignores the body still cannot mistake a block for a permit.

## Deployment

```bash
psql "$SUPABASE_DB_URL" -f supabase/step_governance.sql
```

Additive, idempotent, RLS-enabled, service-role only.
