# Operations Agent — Design & Architecture

**Resurrection Tech™ — internal autonomous operations layer, governed by Runtime Governance.**

This is not a chatbot. It is a continuously running enterprise operations system that
monitors and assists the Runtime Governance platform while remaining **subject to**
Runtime Governance itself. The agent is not trusted; the Morrison engine remains the
final decision authority. Nothing in this design modifies the engine or replaces an
existing system — every piece extends around `lib/runtime` and the deployed
governance-service, following the established Control Room philosophy.

---

## 1. System architecture

```
                       ┌─────────────────────────────────────────────┐
   External clients    │              Control Room (Next.js)          │
  ┌────────────────┐   │  /admin/runtime      Operator Control Room   │
  │ OpenClaw       │   │  /admin/operations   Operations Dashboard    │
  │ Slack / Teams  ├──▶│                                              │
  │ Discord / WA   │   │  /api/runtime/*      Runtime Governance API  │
  │ Telegram       │   │  /api/ops/*          Operations API (NEW)    │
  └────────────────┘   └───────┬──────────────────────┬───────────────┘
        scoped opsk_ keys      │                      │
                               ▼                      ▼
                     ┌──────────────────┐   ┌──────────────────────┐
                     │  lib/runtime/*   │   │      lib/ops/*        │
                     │  (existing core) │◀──│  Operations Agent     │
                     │  store · admin · │   │  observers · reasoning│
                     │  engine · alerts │   │  governor · proposals │
                     │  reports · hub … │   │  evidence · events …  │
                     └───┬──────────┬───┘   └──────────┬────────────┘
                         │          │                  │  every action, BEFORE execution
                         ▼          │                  ▼
                  ┌────────────┐    │   ┌──────────────────────────────┐
                  │  Supabase  │    └──▶│  Morrison Runtime Governance  │
                  │  rg_* +    │        │  (governance-service, Railway)│
                  │  rg_ops_*  │        │  + operations_rules.py (NEW)  │
                  └────────────┘        └──────────────────────────────┘
```

Components:

| Component | Where | Role |
|---|---|---|
| Operations Agent | `lib/ops/*` | Observe → Reason → Propose → (governed) Execute |
| Control Room API | `app/api/runtime/*` (existing) + `app/api/ops/*` (new) | Operator + client surfaces |
| Runtime Governance API | governance-service (FastAPI, Railway) | Final authority on every action |
| Evidence Hub | `lib/runtime/hub.js` + `rg_ops_evidence` | Searchable decision evidence |
| Supabase | `supabase/*.sql` | Durable store (`rg_*`, `rg_ops_*`) |
| GitHub / Railway / Vercel | `lib/ops/integrations.js` | Read-only health monitors |
| Enterprise Reporting | `lib/runtime/reports.js` (reused) | Report generation executor |
| Notification Service | `lib/runtime/alerts.js` + `notify.js` (reused) | Webhook/email dispatch |

OpenClaw is deliberately **not** a component: it is one future *client* of the
Operations API, authenticated with a scoped key like any other bridge (§9).

## 2. Folder structure

```
lib/ops/                        # framework-agnostic CommonJS core (mirrors lib/runtime)
  index.js                      #   barrel + health (engine reachability, fail-closed note)
  actions.js                    #   privileged action catalog + executor registry
  governor.js                   #   Runtime Governance gate (fail-closed)
  proposals.js                  #   proposal lifecycle (propose/approve/deny/execute)
  evidence.js                   #   write-once decision evidence
  events.js                     #   durable event log + in-process pub/sub
  observers.js                  #   platform observation snapshot (read-only)
  reasoning.js                  #   LLM adapter (structured JSON only) + heuristics
  agent.js                      #   cycle orchestrator + run records
  briefing.js                   #   executive summary ("Morning." payload)
  clients.js                    #   scoped client keys (OpenClaw-ready)
  integrations.js               #   GitHub/Railway/Vercel/Supabase probes
app/api/ops/                    # Operations API routes (see §3)
app/admin/operations/page.tsx   # Operations Dashboard (operator)
components/admin/OperationsClient.tsx
governance-service/operations_rules.py       # deployment-level Ω rules for ops actions
governance-service/test_operations_rules.py  # 18-case hardening probe
supabase/operations_agent.sql   # rg_ops_* schema additions
scripts/ops/agent.test.cjs      # hermetic 27-case pipeline test (mock engine)
docs/OPERATIONS-AGENT.md        # this document
```

## 3. API specification (`/api/ops/*`)

Auth legend — **O**: operator (Control Room session cookie or `x-admin-key`),
**C(scope)**: external client key `x-ops-client-key` with the named scope,
**cron**: `CRON_SECRET` bearer.

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/ops/health` | GET | public-safe | Agent + trust-chain status (engine reachable? store durable?) |
| `/api/ops/status` | GET | O or C(status) | Recent runs, proposal + evidence summaries |
| `/api/ops/run` | POST | O | Trigger one agent cycle on demand |
| `/api/ops/cron` | GET | cron | Scheduled cycle (Vercel cron; daily by default — Hobby-safe) |
| `/api/ops/actions` | GET | O | Registered action catalog (risk, Ω tool names) |
| `/api/ops/proposals` | GET | O or C(proposals:read) | Proposal queue + summary |
| `/api/ops/proposals` | POST | O | `{id, decision:approve\|deny}` sign-off, or `{action_id, params}` operator-initiated proposal |
| `/api/ops/evidence` | GET | O | Searchable decision evidence (org/verdict/action/since) |
| `/api/ops/events` | GET | O | Recent events |
| `/api/ops/events` | POST | O or C(events:write) | Ingest external event (namespaced `external.*`) |
| `/api/ops/briefing` | GET | O or C(briefing) | Executive briefing — counts + human-readable lines |
| `/api/ops/dashboard` | GET | O or C(status) | Full dashboard aggregation |
| `/api/ops/customers` | GET | O or C(status) | Customer intelligence — scored profiles; `?org_id=` adds the lifecycle + evidence + transition + approval history |
| `/api/ops/lifecycle` | GET | O or C(status) | Governed lifecycle — platform summary; `?org_id=` adds state + transition + approval history |
| `/api/ops/lifecycle` | POST | O | Advance one governed step (proposes through Runtime Governance; privileged transitions escalate, never auto-execute) |
| `/api/ops/agents` | GET | O or C(status) | Multi-agent roster — five specialists with charter, live workload, recent attributed proposals; `?view=council` returns each agent's current read-only assessment |
| `/api/ops/agents` | POST | O | Run the governed multi-agent (council) cycle — each specialist proposes through the shared governor; high-risk transitions still escalate |
| `/api/ops/handoffs` | GET | O or C(status) | Coordination spine — platform summary + per-agent queues + blocked-work; `?org_id=` returns the full handoff timeline (chain of responsibility) |
| `/api/ops/handoffs` | POST | O | Operator `cancel` (supersede) or `retry` (reopen) a handoff — coordination only; the next governed cycle proposes through Runtime Governance |
| `/api/ops/integrity` | GET | O or C(status) | Read-only coordination-integrity check — reconciles handoffs ↔ proposals ↔ evidence ↔ audit and returns a green/red report with named anomalies (`?days=` window) |
| `/api/ops/gmail/auth` | GET | O | Start read-only Gmail connect — redirects to Google consent (gmail.readonly, offline, signed CSRF state) |
| `/api/ops/gmail/callback` | GET | O | OAuth callback — verifies state, exchanges the code, stores the refresh token **encrypted** |
| `/api/ops/gmail` | GET | O or C(status) | Gmail connection status + recent inbound email events (`?org_id=` filters to one customer) |
| `/api/ops/gmail` | POST | O | Operator `poll` (read new mail into evidence) or `disconnect` (revoke + drop token). No send/modify path exists |
| `/api/ops/incidents` | GET | O or C(status) | Incident ledger + summary (`?status=open&org_id=`) |
| `/api/ops/incidents` | POST | O | Operator resolves an incident (`{id, action:"resolve", note?}`) |
| `/api/ops/graph` | GET | O or C(status) | Enterprise memory — an org's derived evidence graph (`?org_id=`, required); `&node=` traces one node to evidence; `&view=replay` returns the decision timeline |
| `/api/ops/clients` | GET/POST | O | Issue / revoke scoped client keys |

Existing Control Room coverage (unchanged, reused): customers/orgs
(`/api/runtime/admin/orgs|onboard|delete-customer`), audits
(`/api/runtime/admin/audit`, audit packs), deployments/verdicts
(`/api/runtime/decisions`, `evaluate`), evidence hub (`/api/runtime/admin/hub`,
`/evidence/hub/[token]`), enterprise reports (`/api/runtime/reports`), pilot &
engagement status (`/api/runtime/admin/engagement`), notifications
(`/api/runtime/admin/notify`, `alerts`), runtime policies (engine `/v1/*` via
`lib/runtime/engine.js`).

## 4. Database additions (`supabase/operations_agent.sql`)

All tables ride the existing store layer (`rg_` namespace, service-role-only RLS,
file-store fallback for day-1/dev):

| Table | Purpose |
|---|---|
| `rg_ops_proposals` | Proposal lifecycle (params, reasoning, governor decision, execution, operator sign-off) |
| `rg_ops_evidence` | Write-once evidence: timestamp · actor · agent · policy · risk · reason · verdict · execution result · org — no update/delete path exists in the app, and the engine's `ops_evidence_destruction` rule blocks the agent from proposing removal |
| `rg_ops_events` | Durable event log (`observation.* proposal.* execution.* integration.* cycle.* external.*`) |
| `rg_ops_runs` | One row per agent cycle — the agent's own audit trail |
| `rg_ops_client_keys` | Hashed, scoped external-client keys (plaintext shown once) |

## 5. Event system

`lib/ops/events.js` = durable log + in-process pub/sub. Internal modules emit as
they work (`proposal.created`, `execution.executed`, `cycle.completed`, …);
external systems POST to `/api/ops/events` (GitHub webhook bridges, deploy hooks,
chat clients), namespaced `external.*`. Subscribers are fire-and-safe — a failing
handler never breaks the emitting path — and can trigger event-driven agent
cycles alongside the schedule.

## 6. Background worker architecture

The agent runs as governed **cycles**, not a resident daemon — a deliberate fit
for the platform's serverless deployment (Vercel) while remaining portable:

1. **Scheduled**: Vercel cron → `/api/ops/cron` (daily at 07:00 UTC by default in `vercel.json`; bump to a sub-daily schedule like `0 */4 * * *` on Vercel Pro).
2. **On demand**: operator → `/api/ops/run` or the Dashboard's "Run agent cycle".
3. **Event-driven**: `events.subscribe(...)` handlers can invoke `agent.runCycle`.

Each cycle: `observe()` (read-only snapshot) → `reasoning.recommend()`
(structured JSON only) → confidence gate (`OPS_MIN_CONFIDENCE`, default 0.6) +
24h dedupe → `proposals.propose()` → governor → execute/escalate/block →
evidence → run record. Because `lib/ops` is plain CommonJS with no framework
dependency, the same cycle can later be hosted as a long-running Railway worker
(`setInterval` around `agent.runCycle`) without any code change — only the
trigger moves.

## 7. Security model

- **The agent is untrusted.** It can only *propose* catalog actions.
  Unknown actions are blocked without an engine round trip (deny-by-default).
- **Fail-closed.** Engine unreachable ⇒ every proposal blocks
  (`fail_closed_engine_unavailable`); nothing executes ungoverned. (Tested.)
- **The LLM never executes.** `reasoning.js` returns schema-validated JSON
  (`{decision, confidence, reason}`); invalid or non-catalog decisions are
  dropped; every surviving recommendation still passes the engine. A hostile or
  hallucinated recommendation is contained twice.
- **Human sign-off is an engine flag, not a bypass.** Approving an escalated
  proposal re-evaluates the same trajectory with the catalog's authorisation
  flags (`pilot_approved`, `deployment_approved`, …) — the permit is issued by
  the engine's own Ω rules and the approving operator is recorded in evidence.
- **Two never-execute classes.** Evidence destruction and credential sharing
  are unconditional Ω violations; no flag combination cures them, executors are
  refused in code, and the attempt itself becomes evidence.
- **AuthZ separation.** Operators (session/admin key, existing `adminauth`) can
  approve/deny/run; external clients hold sha256-hashed `opsk_` keys with narrow
  scopes and can never approve or execute. All operator mutations land in the
  existing `rg_admin_audit` log.
- **Evidence integrity.** Evidence rows are write-once; store deletes require a
  scoping filter; RLS keeps `rg_ops_*` service-role-only.

## 8. Runtime Governance integration points

1. **`governance-service/operations_rules.py`** — deployment-level Ω rules over
   existing `OmegaDomain` enum values (ENTERPRISE / COMPLIANCE / DATA_PRIVACY;
   engine untouched). Deny-by-default per privileged tool + two unconditional
   rules. Wired into `DEPLOYMENT_RULES` in `app.py`; attributed to the V5+
   layer; inert for customer workloads (tool-scoped). 18/18 hardening cases.
2. **`lib/ops/governor.js`** — converts each proposal into a synthetic one-step
   trajectory (`{tool, args:{flags…}}`) and calls the existing
   `lib/runtime/engine.js` client (`/v1/evaluate`, domains
   `enterprise, compliance, data_privacy`). Verdict mapping:
   `PERMIT→allow` (or `escalate` for high/critical risk without approval),
   `BLOCK/NO_VALID_SOLUTION→block`, `ESCALATE/ENVIRONMENT_SENSITIVE→escalate`,
   unreachable→block. A BLOCK from a deny-by-default *authorisation* rule on an
   unapproved proposal escalates (operator sign-off cures it); unconditional
   rules never do.
3. **Evidence chain** — every decision records the engine's rule, Ω domain,
   trajectory hash and attestation alongside the local policy, so an auditor can
   tie each agent action to the exact engine verdict that authorised or refused it.

## 9. Future OpenClaw support

OpenClaw connects as a **client of the Operations API** — nothing in the core
knows it exists:

1. Operator issues a key: `POST /api/ops/clients {label:"openclaw", scopes:["briefing","status","proposals:read"]}`.
2. OpenClaw sends `x-ops-client-key: opsk_…` and renders:
   - `GET /api/ops/briefing` → the "Morning." reply (`lines[]` / `text` are
     exactly the format in the brief: reports completed, new questionnaires,
     Railway health, violations, pilots awaiting approval);
   - `GET /api/ops/status` / `dashboard` for detail;
   - `POST /api/ops/events` (with `events:write`) to feed signals in.
3. Approvals remain operator-only by scope design — a compromised chat bridge
   cannot authorise actions. Slack/Teams/Discord/WhatsApp/Telegram bridges use
   the identical contract with their own keys.

## 10. Implementation roadmap (incremental, production-mergeable)

| Milestone | Scope | Status |
|---|---|---|
| **M1 — Governance rules** | `operations_rules.py` + tests wired into the deployed service; inert for customers | ✅ this change |
| **M2 — Core + Operations API** | `lib/ops/*`, `/api/ops/*`, `rg_ops_*` schema, hermetic pipeline test (27 cases incl. fail-closed) | ✅ this change |
| **M3 — Dashboard + cron** | `/admin/operations` executive dashboard, Vercel cron cycle, client keys | ✅ this change |
| **M4 — LLM reasoning live** | Set `ANTHROPIC_API_KEY` (+ optionally `OPS_REASONING_MODEL`); shadow-compare LLM vs heuristic recommendations via `rg_ops_runs.reasoning_source` before raising `OPS_MIN_CONFIDENCE` autonomy | config-gated, code shipped |
| **M5 — Deep integrations** | `OPS_GITHUB_REPOS/TOKEN`, `OPS_VERCEL_TOKEN/PROJECT`, `OPS_RAILWAY_HEALTH_URLS`, `OPS_DEPLOY_WEBHOOK` for governed deploy execution | config-gated, code shipped |
| **M6 — Event-driven workflows** | GitHub webhook → `/api/ops/events` bridge; subscriber-triggered cycles; questionnaire/assessment observers over the sales schema | next |
| **M7 — OpenClaw client** | Issue scoped key; build the bridge against `/api/ops/briefing` + `status`; then Slack/Teams/… clones | next |
| **M8 — Hardening** | Per-action rate budgets, proposal expiry/TTL sweep, Ω attestation pinning in evidence exports, notify.js digest of escalations | next |

### Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `GOVERNANCE_URL` / `GOVERNANCE_TOKEN` | Railway service | Engine endpoint (existing) |
| `ANTHROPIC_API_KEY` | unset → heuristics | Enables LLM reasoning |
| `OPS_REASONING_MODEL` | `claude-opus-4-8` | Reasoning model |
| `OPS_MIN_CONFIDENCE` | `0.6` | Proposal confidence gate |
| `OPS_STALL_DAYS` | `7` | Stalled-journey threshold |
| `OPS_COORDINATION` | unset → off | Pillar 5: when on (`1`/`true`), the council **ingests** inbound handoffs through the shared governor. Off preserves 4.0 direct execution; handoffs are still recorded as coordination facts |
| `OPS_HANDOFF_MAX_ATTEMPTS` | `5` | Bounded fail-closed retries before a handoff is marked blocked |
| `OPS_GMAIL_CLIENT_ID` / `OPS_GMAIL_CLIENT_SECRET` | unset → off | Google OAuth client — enables read-only Gmail inbox monitoring |
| `OPS_GMAIL_REDIRECT_URI` | `${NEXT_PUBLIC_SITE_URL}/api/ops/gmail/callback` | OAuth callback (must match the Google client) |
| `OPS_GMAIL_TOKEN_SECRET` | derived from `RUNTIME_SESSION_SECRET`/`RUNTIME_ADMIN_KEY` | AES-256-GCM key for encrypting the refresh token at rest |
| `OPS_GMAIL_QUERY` | `in:inbox newer_than:7d -category:promotions -category:social` | Gmail search scoping what is read |
| `OPS_GMAIL_MAX_MESSAGES` | `50` | Per-poll message cap |
| `OPS_GMAIL_STORE_BODIES` | `false` | **Opt-in** full-body indexing; off = metadata + snippet only (data minimisation) |
| `OPS_GITHUB_REPOS` / `OPS_GITHUB_TOKEN` | unset | GitHub monitoring |
| `OPS_VERCEL_TOKEN` / `OPS_VERCEL_PROJECT` | unset | Vercel deployment monitoring. **Not required for the Vercel card to show healthy** — when running on Vercel the agent self-reports from Vercel's injected `VERCEL` / `VERCEL_ENV` / `VERCEL_GIT_COMMIT_SHA` system vars; the token only adds cross-project deployment history. (`CRON_SECRET` is unrelated — it gates continuous mode, not this card.) |
| `OPS_RAILWAY_HEALTH_URLS` | unset | Extra Railway probes (engine always probed) |
| `OPS_DEPLOY_WEBHOOK` | unset | Governed deploy execution hook |
| `CRON_SECRET` | existing | Gates `/api/ops/cron` |

## 11. Control Room surface (implemented)

`/admin/operations` is the operator UI over the Operations API (shares the
`/admin/runtime` session; an "Operations" link is in the Control Room nav):

- **Briefing view** — contextual greeting (`RUNTIME_OPERATOR_NAME` +
  `OPS_TIMEZONE`, default Europe/London), generation timestamp, grounded
  briefing items (click any statement → sourceType, sourceIds, time window,
  records, supporting view), operational counts (12 tiles, each a drill-down;
  `n/a` = source not configured, never zero), prioritised recommended actions
  with approve/deny/propose/evidence buttons, and the "Morning." input.
- **Approvals view** — escalated proposals; approval re-evaluates through the
  engine with the operator identity attached.
- **Blocked view** — attempted action, actor/agent, org, policy, Ω rule,
  risk, timestamp, evidence id + trajectory hash, remediation possibility.
- **Systems view** — status cards (`healthy / degraded / unavailable /
  not_configured / awaiting_credentials`) for engine, Control Room, Supabase,
  Railway, Vercel, GitHub, worker/scheduling, LLM provider, OpenClaw, email —
  each unconfigured card names its required env vars. Plus recent agent cycles.
- **Evidence view** — searchable write-once decision evidence.
- A mode banner shows **On-demand monitoring / Continuous monitoring active /
  Worker offline** — derived from real run records, never asserted.

The "Morning." input routes prompts through `/api/ops/ask` — a fixed intent
registry (briefing · attention/priorities · blocked · approvals · system
health · pilot readiness) answered exclusively from authorised operational
data. Unknown prompts return the supported-intent list; there is no free-form
generation and no execution path.

## 11a. Customer Intelligence + Executive OS (4.0 Pillars 1–2)

`lib/ops/intelligence.js` turns every organisation into a living, **deterministic,
explainable** operational object — no LLM, no fabrication. Each score is 0–100,
banded, and carries its exact labelled input components + a formula string
(surfaced in the Customers view as expandable "how it's computed" detail):

| Score | Inputs (disclosed) |
|---|---|
| **Engagement** | stage ladder · named contacts · review cadence · note recency · configured record |
| **Pilot readiness** | stage · governance material (pack/report) · assessment · recent runtime activity · ingest key |
| **Runtime risk** | block rate · escalation rate · engine availability · enforced blocks (no data → `insufficient_data`, never a fake number) |
| **Health** | `0.5·engagement + 0.3·pilotReadiness + 0.2·(100−risk) − stallPenalty` |

Plus integration status, last meeting, a deterministic next recommendation (which
**proposes through governance**, never executes), a business-value band, and a
merged evidence timeline (governance decisions · reports · audit packs · notes ·
runtime decisions, newest first).

**Executive OS** (`lib/ops/briefing.js`): recommended actions are ranked by
business impact — `40·severity + 30·healthUrgency + 20·businessValue +
10·staleness` — and the briefing surfaces a single **top priority** with a
deterministic **confidence** (the margin by which #1 leads #2, disclosed in
`confidence_basis`). The exec-summary text carries a `Recommended priority:
<customer> — … (confidence NN%)` line. Surfaced in the Control Room as a
top-priority banner on the Briefing view and a **Customers** tab; queryable via
the ask router (`customer health`, `how is <org>?`, `who is at risk?`,
`summarise enterprise pipeline`, `explain today's recommendations`).

Fully deterministic and evidence-grounded — the LLM never scores, ranks, or
executes; it only ever narrates.

## 11b. Governed Lifecycle State Machine (4.0 Pillar 3)

`lib/ops/workflow.js` is the platform backbone: every organisation moves through
one canonical governed lifecycle, and agents (Pillar 4) operate **within** it —
they never invent or own workflows.

```
lead → questionnaire → assessment → executive_report → pilot →
deployment → runtime_monitoring → renewal
```

Two guarantees:

1. **WHERE an org is — derived, never asserted.** `state(org)` reads real
   records (engagement stage · reports · environments · governed runtime
   decisions) and returns the current stage **with the exact signal that placed
   it there**. Same records → same stage, always (replayable). `runtime_monitoring`
   is only reached once real governed evaluations are observed — the honest
   signal, not a flag.
2. **HOW it advances — every forward step is a governed proposal.** Each stage
   maps to a catalog action routed through the existing governor → proposals →
   evidence spine. Low/medium transitions auto-execute **only after an engine
   PERMIT**; the privileged ones (`promote_to_pilot`, `deploy_runtime`,
   `initiate_renewal`) **escalate for operator approval and never auto-execute**.
   `advance()` is idempotent (an in-flight transition won't re-propose) and
   fail-closed (engine down → the transition blocks, the stage holds).

Each transition appends an immutable `rg_ops_transitions` row **linked to its
proposal**, so the transition log stays fixed while the proposal carries the
live governance verdict + approval — giving fully auditable, replayable
**transition history** and **approval history**.

Customer pages expose current stage · completed stages · next governed action
(with an Advance / Propose-transition button) · transition history · approval
history · evidence timeline. The briefing surfaces lifecycle progress (orgs by
stage + available next governed actions); the ask router answers "where is
&lt;org&gt; in the lifecycle" and "next governed action for &lt;org&gt;".

Deterministic and governed end-to-end — the state machine owns the workflow;
agents (Pillar 4, below) simply take responsibility for individual transitions
on top of it.

## 11c. Multi-Agent Core (4.0 Pillar 4)

`lib/ops/agents.js` splits the single Operations Agent into a **council of five
governed specialists** — **Sales · Deployment · Customer Success · Compliance ·
Finance**. They add division of labour and attribution; they add **no new
trust**. Three invariants:

1. **Agents don't own workflows.** Each specialist owns a slice of the Pillar-3
   lifecycle (a set of stages whose next governed transition it may advance) plus
   a **charter** of catalog actions. An agent never invents a transition — it
   advances the **same** state machine everyone shares. `workflow.nextAction(stage)`
   is the single source of truth for "what comes next"; a specialist acts only
   when that step is inside its charter.

   | Agent | Owns lifecycle stages | Chartered actions |
   |---|---|---|
   | Sales | lead · questionnaire · assessment · executive_report | record_questionnaire, complete_assessment, generate_report, promote_to_pilot, create_recommendation |
   | Deployment | pilot · deployment | deploy_runtime, activate_monitoring, raise_alert |
   | Customer Success | runtime_monitoring · renewal | initiate_renewal, create_recommendation, notify_operator |
   | Compliance | — (cross-cutting) | raise_alert, notify_operator, send_confidential_report |
   | Finance | — (cross-cutting) | generate_report, notify_operator |

2. **Charter = a second deny-by-default layer, before the engine.** `agentPropose`
   refuses any action outside the agent's charter **at the agent boundary** — it
   never reaches Runtime Governance. Every surviving proposal **still** passes the
   shared governor, so a mis-scoped or hostile recommendation is contained twice
   (agent charter, then Ω engine). No agent gets elevated trust: a high-risk
   action a specialist is chartered for **still escalates for human approval**,
   exactly as before. Refuse-class actions (`delete_evidence`, `share_credentials`)
   are outside every charter.

3. **One spine.** Every specialist proposal flows through the same
   `proposals.propose → governor.evaluate → evidence.record` path, tagged with
   `agent_id`, so evidence and audit show **which agent proposed what** and how
   the engine ruled. `council()` is a read-only assessment (what each specialist
   would do now); `dispatch()` runs the governed multi-agent cycle and records an
   `rg_ops_runs` row (`mode: council`) with per-agent outcomes. Both are
   **deterministic** — specialists reason from records + the lifecycle, not an LLM.

The Control Room **Agents** tab shows each specialist's mandate, charter (with
per-action risk/auto/approval markers), live workload (proposals by status), and
recent attributed proposals with the governance verdict, plus a **Run council
cycle** button. The briefing carries a `multi_agent` block; the ask router
answers "which agent owns …", "what is the Sales agent doing", "show the council".

## 11d. Agent Coordination Spine (5.0 Pillar 5, Phase 1)

`lib/ops/handoffs.js` lets agents hand governed work to one another. A **handoff**
is a typed, durable, auditable record of one agent passing work to another — and
it is a **coordination record, never an authority**:

- it routes work between departments and records the baton pass;
- it **never** changes customer state — state changes only ever happen through
  the linked governed proposal (`proposals → governor → evidence`), the same
  trust path as before. A handoff just names the action a receiving agent should
  **propose**, and links to that proposal once it does.

The one ledger triples as the **inter-agent handoff log** (chain of
responsibility, replayable), each agent's durable **task queue** (its open
inbound handoffs), and the **blocked-work list** (status `escalated`/`blocked`).
Every handoff carries: originating agent · receiving agent · organisation ·
reason · supporting evidence · proposed action · risk. Its governance verdict and
approval status resolve live from the linked proposal.

**Status machine:** `open → accepted → resolved` (auto after PERMIT) ·
`→ escalated → resolved` (operator approval) · `→ blocked` (engine BLOCK, or an
action outside the receiver's charter — a misrouted work item) · engine
unreachable keeps it `open` and retried (bounded via `OPS_HANDOFF_MAX_ATTEMPTS`),
never lost. Re-emitting an identical in-flight handoff is idempotent.

**The council cycle** (`agents.dispatch`) runs **OBSERVE → RECONCILE → ROUTE
(emit typed handoffs) → PROPOSE → RECORD**. When `OPS_COORDINATION=1`, receiving
agents **INGEST** their inbox — draining each handoff through the *shared*
governor (lifecycle actions only ever via `workflow.advance`, so a handoff can
never make the state machine skip or reorder a stage; duty actions via
`agentPropose`, charter-checked first). With the flag off, 4.0 direct execution
is preserved byte-for-byte and handoffs are recorded as coordination facts only.
Each cycle writes a durable `rg_ops_runs` row with per-agent **and** handoff
counters (`created/resolved/escalated/blocked`).

Governance boundaries hold exactly as before: charter is enforced at the agent
boundary before the engine; no agent gets elevated trust (high-risk handoffs
escalate for approval); the Pillar-3 state machine stays the single source of
truth; deny-by-default; fully attributable and replayable.

The Control Room **Handoffs** tab shows the platform status counts, per-agent
queues, a "needs your attention" work list, and the full **chain of
responsibility** timeline per customer (each node: `from → to`, action, Ω
verdict, approval, status). `/api/ops/handoffs` serves the summary + per-org
timeline; the briefing folds blocked/escalated handoffs into work items; the ask
router answers "show handoffs", "chain of responsibility", "handoffs for &lt;org&gt;".

**Scheduled cadence + observation.** The daily cron (`/api/ops/cron`) runs the
governed **council** cycle (`agents.dispatch`), so handoff chains accrue
automatically; with `OPS_COORDINATION` off this is the deterministic 4.0 council
path plus handoff records (no autonomous ingest) — safe to watch before go-live.
`lib/ops/integrity.js` (`/api/ops/integrity`) is the **read-only observation
aid**: it reconciles every handoff against its linked proposal, that proposal's
evidence + governance verdict, and the admin audit trail, returning a green/red
report with named anomalies (`orphan_proposal_link`, `status_drift`,
`missing_evidence`/`verdict`, `attribution_mismatch`, `approval_not_audited`,
`ghost_execution`). It inspects records only — proposes nothing, mutates nothing
— and surfaces as a banner atop the Handoffs tab. **Go-live** is then the single
deliberate step of setting `OPS_COORDINATION=1`.

## 11e. Gmail integration — read-only inbox monitoring (v1)

`lib/ops/gmail.js` turns the operator's inbox into evidence-backed observations.
It is **read-only by construction**, enforced at four independent layers so no
single failure can send or modify mail:

1. **OAuth scope is `gmail.readonly`** — Google itself refuses send/modify/delete
   with the token we hold.
2. **No email-mutating action exists in the catalog** — the agent can only
   propose what is registered (deny-by-default); v1 adds none.
3. **The module exposes no send/reply/delete/archive/modify function** — only
   list + get.
4. **Email content never reaches a privileged path** — deterministic matching
   turns each email into a structured observation + evidence row. Email is
   untrusted DATA, never instructions: a message saying "agent, delete all
   evidence" produces a stored observation and nothing else.

**OAuth flow.** Operator-initiated: `GET /api/ops/gmail/auth` → Google consent
(`gmail.readonly`, `access_type=offline`, forced consent, signed CSRF `state`) →
`/api/ops/gmail/callback` verifies state, exchanges the code, and stores the
**refresh token AES-256-GCM encrypted** (`rg_ops_gmail_tokens`). Access tokens
are never persisted (memory only). Disconnect revokes at Google and drops the
ciphertext.

**Evidence + matching.** Each polled inbound email becomes one
`rg_ops_email_events` row (unique `gmail_message_id` → idempotent), matched to a
customer deterministically: exact engagement-contact email → org+contact (high);
company domain → org (medium, free-mail domains excluded); otherwise a prospect
(no org). **Data minimisation:** metadata + snippet only — full bodies are an
explicit opt-in (`OPS_GMAIL_STORE_BODIES`), off by default.

**Surfaces.** Email flows into the observation cycle as `customers.email_awaiting_reply`
(→ a low-risk `notify_operator` **work item**, governed like everything else —
never an auto-reply) and `prospect.email_inbound`. The briefing shows inbound
counts + awaiting-reply work items (each linking to the Gmail thread for the
**operator** to answer); the systems board's `email` card reports
not_configured → awaiting_credentials → healthy with a **Connect Gmail** button.

**Security boundaries:** read-only scope; refresh token encrypted at rest, access
tokens never persisted, secrets never logged or returned; all routes
operator-only, callback CSRF-checked; operator-only mailbox; service-role-only
tables; fail-soft (Gmail down → honest unavailable) and fail-closed (any
resulting agent action still passes Runtime Governance).

**Google setup:** create a Web OAuth client (add the callback redirect URI),
enable the Gmail API, and configure the consent screen with the `gmail.readonly`
restricted scope. For a single internal mailbox, **Testing** publishing status
works immediately (add the operator as a test user) but refresh tokens expire
every 7 days; **publish + verify** once for non-expiring unattended monitoring.

## 11f. Governed Action Execution (5.0 Phase 2)

Phase 2 adds the **post-execution verification spine** and the first **governed
internal executors**, under the invariant *a new capability and the governance
rule constraining it ship together*.

**Verification spine.** A catalog action may declare `verify(result, params) →
{ok, detail}`. `proposals.execute` runs `execute → verify` and records
`execution.verified`. A failed verification does **not** undo the action but is
never a silent success: the platform opens an **incident** directly (a system
safeguard — not a governed proposal, so no recursion). Actions without a
`verify()` are unaffected (backward compatible).

**First executors (low-risk, internal-only, deterministic):**

| Action | Effect | Verifier | Owner |
|---|---|---|---|
| `open_incident` | opens a durable operator work item | incident row exists + open | Compliance |
| `refresh_customer_intelligence` | snapshots a customer's scores (`rg_ops_intel_snapshots`) | snapshot row written | Customer Success |
| `schedule_internal_review` | sets an org's next review date | engagement date == input | Customer Success |

Each still flows through `proposal → governor → evidence`. They are **internal
only, engine-enforced**: the new Ω rule `ops_internal_action_external_reach`
(`operations_rules.py`, DATA_PRIVACY) **BLOCKS** any of these tools that carries
an external destination — the "internal" classification is governed, not merely
asserted. The `rg_ops_incidents` ledger surfaces open incidents as briefing work
items and via `/api/ops/incidents` (operator resolves with attribution).

**Held for a later batch** (explicitly *not* in this phase): `prepare_draft_reply`
(draft-only email follow-ups — external-comms text, so it waits until the
verify-spine is proven), and the approval-gated privileged executors, added one
at a time each with its own Ω rule.

## 11g. Enterprise Memory / Evidence Graph (5.0 Phase 3)

`lib/ops/graph.js` is a shared organisational memory every agent can **query but
none can silently rewrite** — because it is a **derived, read-only projection**
over the existing authoritative records, not a new mutable store. `build(org)`
reassembles the graph on demand from orgs · contacts · reports · proposals ·
verdicts · approvals · executions · evidence · transitions · handoffs ·
incidents · intelligence snapshots · inbound emails · runtime decisions. Nothing
to drift, nothing to tamper with.

**Provenance taxonomy** — every node is one of five classes, so nothing enters a
briefing "as fact" without support: `observed_fact` (links to its evidence) ·
`deterministic_derivation` (links to the facts it was computed from) ·
`model_interpretation` (an LLM reasoning output) · `recommendation` (proposed,
not decided) · `approved_decision` (an operator sign-off). The briefing now
tags every statement with its class and reports `provenance.unsupported_facts`.

**Guarantees:** source records stay authoritative; every derived node links back
to evidence; **contradictions are surfaced, never silently resolved**
(`executed_but_unverified`, `resolved_handoff_without_execution`,
`stale_intelligence_snapshot`); decisions are **replayable** (`replay(org)`
reconstructs the immutable, ordered decision timeline); and the graph is
**strictly tenant-scoped** — an `org_id` is required and only that org's
subgraph is ever returned, so confidential data never crosses a boundary.

The Control Room **Memory** tab picks a customer, groups its nodes by provenance,
flags contradictions, and lets the operator click any node to **trace it back**
to its records, agent, governance verdict and outcome, or replay the decision
timeline. Served by `/api/ops/graph`.

## 12. Activating continuous monitoring

The Control Room works today in **on-demand mode** (briefings generated from
current records on open/refresh). Continuous mode needs no code change — the
mode banner flips automatically when scheduled cycles appear in `rg_ops_runs`:

1. **Vercel cron (simplest)** — set `CRON_SECRET` in Vercel env. The cron in
   `vercel.json` hits `/api/ops/cron` daily at 07:00 UTC (Hobby plans cap crons at once/day; Pro can go sub-daily); each hit is a full governed
   cycle. Freshness window is `2 × OPS_CYCLE_INTERVAL_HOURS` (default 4).
2. **Railway persistent worker (optional)** — run a Node process that calls
   `require("./lib/ops").agent.runCycle({ trigger: "worker" })` on an interval
   with the same env vars (`GOVERNANCE_URL`, Supabase keys, `ANTHROPIC_API_KEY`).
   Any trigger starting with `cron` or `worker` counts as scheduled.
3. Set `OPS_WORKER_MODE=continuous` once a worker is expected — the board then
   reports **Worker offline** (instead of on-demand) if cycles stop arriving.

## 13. Connecting OpenClaw later (exact steps)

OpenClaw is a scoped API client; the Control Room remains the only approval
surface. To connect it:

1. In the Control Room (or via curl with the admin key):
   `POST /api/ops/clients` with `{"label": "openclaw", "scopes": ["briefing", "status", "proposals:read"]}` —
   the `opsk_…` key is returned **once**. (The label `openclaw` is what the
   systems board watches to report OpenClaw connection state.)
2. Configure the OpenClaw bridge to send `x-ops-client-key: opsk_…` and call:
   - `GET /api/ops/briefing` — the "Morning" payload (`greeting`, `lines`,
     `text`, grounded `items`, `recommended_actions`);
   - `POST /api/ops/ask` with `{"prompt": "…"}` for the intent-routed answers;
   - `GET /api/ops/status` / `GET /api/ops/dashboard` for detail;
   - optionally `POST /api/ops/events` (requires the `events:write` scope) to
     feed signals in.
3. What OpenClaw can **never** do by scope design: approve/deny proposals,
   trigger cycles, issue keys, or read raw evidence — those endpoints require
   the operator session/admin key. A compromised bridge cannot authorise
   actions.
4. The systems board reports the connection honestly: `not_configured` (no
   key) → `awaiting_credentials` (key issued, never used) → `healthy` (key in
   use, `last_used_at` shown). Revoke anytime via `POST /api/ops/clients`
   `{"id": "…", "revoke": true}`.

### Verification

```bash
npm run ops:test                       # pipeline (27) + grounded briefing (51) tests, hermetic mock engine
cd governance-service && PYTHONPATH=<engine> python3 test_operations_rules.py   # 18 Ω cases
npm run typecheck
npm run build
```
