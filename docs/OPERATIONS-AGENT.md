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

## 11h. Executive Command (5.0 Phase 4 — Pillars 9 + 10)

`lib/ops/autonomy.js` adds one control over **how autonomously the council may
act**, plus per-agent pauses. It gates the **autonomous council path only** —
operator-initiated proposals always run, in every mode. A single stored row
(`rg_ops_autonomy`, singleton `current`) holds the mode; **default = unset =
`execute_low_risk`, so today's behaviour is preserved byte-for-byte.**

**Modes, least → most autonomous:** `emergency_pause` (the council halts —
nothing proposed or executed) · `observe` (assess + route handoffs, but propose
nothing) · `recommend` (propose, but **hold** every proposal for operator
sign-off) · `execute_low_risk` (low/medium auto-execute after PERMIT; high
escalate — the default) · `governed_autonomy` (adds coordination ingest).
`agents.dispatch()` reads the mode first: `emergency_pause` returns a halted run
immediately (works even with the engine down); `recommend` threads an additive
`hold` flag through `proposals.propose` so a governed PERMIT is **downgraded** to
a held escalation (never upgraded); paused specialists are skipped while the rest
of the council runs.

**Safety asymmetry (the core invariant):** **lowering** autonomy toward the pause
is **always allowed and audited** — a fail-safe brake that never depends on the
engine — while **raising** autonomy is **governed**. A raise routes through the
`set_autonomy_mode` catalog action carrying `raising_autonomy: true`; the Ω rule
`ops_unauthorized_autonomy_change` (ENTERPRISE) **BLOCKs it without an operator
approval flag**, so a bare raise escalates, and only an operator's approval
re-evaluates it with the authorisation flags and lets the engine issue the
permit that executes the raise. The agent can therefore never grant itself more
authority — `set_autonomy_mode` is in **no agent's charter**, and the API accepts
mode changes from an authenticated operator only. Every mode change is recorded
in the admin audit trail (`ops_autonomy_mode_changed`, with `raised`).

`lib/ops/performance.js` is a **read-only, deterministic** oversight report
(per-agent proposal outcomes + verification pass rate + handoff throughput,
council run throughput, current autonomy state) derived entirely from existing
records — oversight, not authority: nothing here can change a verdict or action.

The Control Room **Command** tab is the executive dashboard: current mode banner,
an **Emergency pause** button, the mode selector (each option labelled ↑ governed
raise / ↓ direct brake), per-specialist pause toggles, council throughput and
per-agent performance. Served by `/api/ops/autonomy` (GET state; POST
`set_mode` / `emergency_pause` / `pause_agent` / `resume_agent`) and
`/api/ops/performance`. The briefing carries an `executive` block with the live
autonomy posture.

## 11i. Expanded Agent Council — Security & Threat (5.0 Phase 5)

The council gains its first new specialist beyond the founding five: a
cross-cutting **Security & Threat Agent** that adds **no new privileged
capability and no new Ω rule** — it is a watchdog built entirely on signals
Runtime Governance already produces.

**Governed refusals become threat evidence.** Every security-sensitive action
the platform BLOCKs is already written as evidence (`ops_evidence_destruction`,
`ops_credential_sharing`, `ops_unauthorized_autonomy_change`,
`ops_internal_action_external_reach`). A new deterministic observer scans that
evidence and emits `security.governed_refusal` signals (one per attempt) plus a
`security.governed_refusals` rollup with the rule mix — turning "the attempt was
governed" into an actionable posture. Read-only: it only surfaces what
governance already refused.

**No elevated trust.** The Security agent is chartered **only** for internal,
low-risk actions (`raise_alert`, `open_incident`, `notify_operator`) — a
privileged action is refused at the agent boundary (charter deny-by-default),
exactly like every other specialist. It reacts (opens an incident per refusal,
raises a posture alert, flags elevated BLOCK volume as possible probing) through
the **shared** proposal → governor → evidence spine, attributed to
`agent_id=security`. It never mutates customer state and can never itself execute
a privileged action — the council's own watchdog, governed like the rest.

The agent appears automatically in the **Agents** roster and the **Command** tab
(pauses + per-agent performance); the briefing carries a `security` block with
the governed-refusal count, rule mix and recent attempts. New env:
`OPS_SECURITY_WINDOW_DAYS` (default 7).

## 12. Guardian OS (v0) — the enterprise operating system

Runtime Governance is the **kernel**; Guardian OS is the **operating system**
running on top of it. Guardian OS does not replace anything and adds no new
trust — it is the unified executive surface that coordinates the enterprise as
one governed runtime. Every privileged action still flows **proposal → Ω
governor → approval → execution → evidence**; nothing here executes.

**Digital Enterprise Twin** (`lib/ops/twin.js`) — a **derived, read-only
projection** of the whole organisation, assembled on demand from the same
authoritative records the platform already owns (orgs · engagements/lifecycle ·
intelligence · proposals · evidence · incidents · handoffs · agents ·
autonomy). It holds no mutable state, so there is nothing to drift and nothing
to tamper with. **It is never a second source of truth:** per-customer
provenance and replay live in the Evidence Graph, and the Twin links *into* it
(`entity()` / `replay()`) rather than duplicating it —

  Twin = **breadth** (every entity + relationship across the org, live)
  Graph = **depth** (one customer's provenance + replayable decision timeline)

Departments **are** the existing governed specialists — a department is a
charter + lifecycle ownership, with no new authority. The Twin exposes customer
and department entities, the chain-of-responsibility relationships (`owns_stage`,
`responsible_for`, `governed_by`), and a five-dimension **enterprise health**
rollup (customer · commercial · security · operational · governance) whose bands
are deterministic from real counts.

**Executive Homepage** (`lib/ops/guardian.js`) — "sitting beside the CEO." It
answers seven grounded questions, each action deep-linked into the existing
governed flow: *what is happening* · *what needs attention* (escalations,
incidents, security refusals, failed verifications) · *what to approve today*
(the real escalated queue) · *biggest opportunity* · *biggest risk* · **what
happens if we do nothing** (a deterministic consequence projection over the
twin — every item traces back to a record) · *enterprise health*. Read-only and
fail-closed inherited: if the engine is down nothing executes, and the homepage
still renders live state so the operator never goes blind.

Served by `/api/ops/guardian` (GET homepage; `?view=twin` for the full model;
`?view=entity&org_id=` for one customer's twin slice). The **Guardian** tab is
the Control Room's default executive landing surface.

## 13. Guardian OS departments — five new governed departments

Five new first-class departments join the council. Because the Twin, Command,
Agents, Guardian, performance, autonomy pauses, council cycles and evidence
attribution all iterate the shared `AGENTS` roster, a department auto-integrates
into every one of those the moment it is added — no isolated dashboards, no
duplicated logic. Each owns work, creates governed proposals, produces evidence
and exposes executive intelligence, through the **same** proposal → Ω governor →
approval → execution → evidence spine. None gets elevated trust.

- **Incident Response** — coordinates the response to an open incident:
  reconstruct trajectory (via the Evidence Graph), assess impact, recommend
  containment, escalate. Chartered for internal actions only (`raise_alert` /
  `notify_operator` / `create_recommendation`) — containment stays a proposal.
- **Runtime Risk Intelligence** — `lib/ops/risk.js` compares the current window
  against the prior one (approval backlog, refusals, policy violations, incident
  rate, approval latency, customer-health drift) and answers "what changed since
  yesterday," raising a governed alert on adverse trends.
- **Enterprise Architecture** — `lib/ops/architecture.js` surfaces which
  customers lack a runtime/architecture assessment and recommends running one
  (the deep tool/trust-boundary discovery is operator-triggered — it needs the
  customer's manifest — so the department never fabricates a discovery).
- **Policy Engineering** — turns recurring governed refusals into policy. It
  **drafts** governance policy (`draft_policy`, an inert internal artifact) but
  **never activates** it: `activate_policy` is critical, operator-only, and
  guarded by the new Ω rule **`ops_unauthorized_policy_activation`** (deny-by-
  default). The agent is not chartered to activate; even an approved activation
  only records authorisation — the live kernel edit stays a deliberate human
  step. Drafts live in `rg_ops_policies`.
- **Partner / MSSP** — `lib/ops/partners.js` (registry `rg_ops_partners`) tracks
  partners, deployments and renewals and surfaces which partner needs attention.

The Executive Homepage gains a **Department intelligence** block answering the
new questions: *what incidents need attention* · *which customers are drifting
to risk* · *where governance slows execution* · *which partner needs attention* ·
*what policy to create next* · *what architecture gaps exist* · *what changed
overnight*. The Enterprise Twin includes all eleven departments automatically.
New env: `OPS_POLICY_GAP_THRESHOLD` (default 2).

## 14. Dynamic runtime policy loading (self-service governance foundation)

The Runtime Governance kernel loads customer-specific Ω policies from the database
**at runtime** — no code change, no redeploy. Policies are versioned, validated
before activation, evidence-backed and rollback-capable, and **every existing
guarantee is preserved.**

**Declarative, not code.** A policy is structured data — a tool match plus
`unauthorized_unless` / `flag_true_blocks` / numeric `threshold` conditions —
compiled by a trusted module (`governance-service/dynamic_rules.py`, mirrored in
`lib/ops/govpolicy.js`) into an `OmegaRule`. No arbitrary code from the database
is ever executed.

**Deny-only → baseline never weakened.** A compiled policy's `check()` returns
block-or-not, never "allow." Loading policies can only **add** constraints, so
deny-by-default and the static `DEPLOYMENT_RULES` are never weakened.

**Fail-closed & optional.** The engine reads active policies over stdlib HTTP
(no new deps), refreshed every `GOVERNANCE_POLICY_REFRESH_S` (default 30s). On any
DB/parse error it keeps the last-good validated set; with no DB configured it uses
static rules only. A DB outage never opens the gate. With no active policies the
engine is byte-for-byte identical to before — the layer-cache key carries a policy
`generation` token so a `GovernanceLayer` rebuilds only when the active set changes,
and the verdict `attestation` already fingerprints the full (static + dynamic)
ruleset, so every decision stays reproducible.

**Governed lifecycle** (`lib/ops/govpolicy.js`, table `rg_governance_policies`):
`draft → validate → activate → (rollback)`, each a new version under a stable
name. Drafting and validating are operator-direct; **activating** a policy into
the kernel is a privileged action (`activate_governance_policy`, critical,
guarded by `ops_unauthorized_policy_activation`) — proposed, then applied by the
operator's own approval, so it flows **proposal → Ω governor → approval →
execution → evidence.** **Rollback is always allowed** (the safety brake), applied
directly and audited — the same asymmetry as autonomy. The agent never activates
policy. Served by `/api/ops/governance-policies`.

Env (all optional; absent = feature off): `SUPABASE_URL`/`GOVERNANCE_POLICY_READ_KEY`
(or the existing service-role key), `GOVERNANCE_POLICY_TABLE`,
`GOVERNANCE_POLICY_REFRESH_S`, `GOVERNANCE_POLICY_TIMEOUT_S`.

## 15. Enterprise Provisioning — the OS installation

Guardian OS installs an enterprise the way you install an operating system, not
the way you complete an onboarding form. One `provision()` call stands up a
**complete governed runtime** — enough information for Guardian OS to run the
enterprise autonomously from the first second. `lib/ops/provisioning.js`, served
by `/api/ops/provisioning`, surfaced in the Control Room **Provision** tab.

Given an enterprise spec, provisioning runs **seven phases** and never throws — a
failed phase records the run as `failed` with the reason, leaving everything it
already created intact for inspection:

1. **Enterprise Identity** — org (`rt.admin.createOrg`) plus identity entities:
   business units, environments (Dev/Test/Production), regions, compliance
   requirements.
2. **AI Estate** — systems, models, agents, tools (privileged flagged), MCP
   servers, APIs, external integrations. Relationships are **auto-mapped** as
   entity `refs` (agent → model/tools/MCP; system → agents/APIs/integrations/
   environment), so the dependency graph is real, not declared.
3. **Trust Architecture** — trust boundaries, identity providers, human approvers,
   privileged operators, risk zones, critical systems, protected assets — linked
   (critical systems → protected assets, boundaries → environments).
4. **Runtime Governance** — every policy is generated through the **dynamic policy
   engine** (§14): fail-closed defaults (`gos_block_unapproved_deploy`,
   `gos_block_external_export`), one `gos_privileged_<tool>` per privileged tool
   discovered in the estate, and a `gos_wire_limit` funds-movement threshold when
   payments are present. Each policy is drafted → validated → activated, **scoped
   to the org** (`scope=org_id`) and **deny-only**, so the kernel is only ever
   *more* constrained after an install. The kernel then enforces them at runtime.
5. **Department Deployment** — the chosen Guardian OS departments (Executive
   Command, Operations, Finance, Security, Compliance, Customer Success, Incident
   Response, Architecture, Risk, Policy Engineering) are enabled as governed
   agents (`rg_enterprise_departments`).
6. **Digital Twin** — the six enterprise graphs (`lib/ops/entgraph.js`:
   enterprise, asset, dependency, runtime, trust, risk) are generated immediately,
   as a pure read-only projection over the estate + live governance records.
7. **Executive Command** — `command(org_id)` assembles a populated payload: health,
   active AI systems, runtime governance status, open approvals, current risks +
   risk zones, departments, twin facet counts, and recommended actions. **There is
   never an empty dashboard** — provisioning seeds realistic example activity (an
   escalated approval, an intelligence snapshot, a warning incident, all clearly
   marked) until live enterprise events replace it.

**Guarantees preserved.** Provisioning is an operator-authorised install: policy
activation flows through the same governed lifecycle (§14), generated policies are
deny-only additions, and the sealed kernel and static `DEPLOYMENT_RULES` are never
touched. New tables (`rg_provisioning`, `rg_enterprise_entities`,
`rg_enterprise_departments`) are additive with RLS enabled. Proven hermetically by
`scripts/ops/provisioning.test.cjs` (mock engine with dynamic-policy enforcement):
all seven phases plus the deny-only invariant — the kernel **BLOCKS** an unapproved
privileged wire transfer after install while leaving unrelated tools **PERMIT**.

## 16. Managed Governance — continuous governance of a provisioned enterprise

Provisioning (§15) stands an enterprise up. **Managed Governance keeps it
governed**: an autonomous governance department that continuously watches every
provisioned enterprise and recommends action *before* risk becomes an incident.
The operator should never have to ask "is my customer's AI safe today?" — Guardian
OS already knows. `lib/ops/managed.js`, served by `/api/ops/managed`, surfaced in
the Control Room **Governance** tab, and run on the daily cron across every
provisioned org (`monitorAll`).

**The governed baseline.** Provisioning captures a baseline automatically
(`captureBaseline`) — a fingerprint of the estate, active policies, departments,
trust boundaries and autonomy level. It is the reference every later observation is
measured against (`rg_governance_baselines`, versioned; re-capturable on demand).

**Continuous monitoring → one pass.** `monitor(org)` runs the full loop and is
idempotent to re-run: **detect drift → score health → generate recommendations →
refresh the operator queue**, recording an audit entry and events each time.

1. **Governance drift** (`detectDrift`) — today's enterprise vs its baseline.
   Detects new AI systems, new MCP servers, new tools, removed controls, disabled
   policies, permission changes (a tool elevated to privileged), unexpected
   autonomy (a raise above baseline) and trust-boundary violations. Each new drift
   becomes an **evidence-backed** `rg_governance_drift` event (deduped by
   fingerprint, so a daily pass never double-reports). A new *privileged* tool or a
   disabled policy is `critical`.
2. **Governance health score** (`health`) — a live 0–100 score with **seven
   sub-scores**: governance maturity, policy coverage, runtime health, approval
   responsiveness, evidence completeness, drift score, and the weighted overall
   *governance confidence*. Open drift measurably lowers it; each snapshot is
   persisted (`rg_governance_health`) so the score **trends over time**.
3. **Recommendations engine** (`recommend`) — drift and coverage gaps become
   improvement recommendations (create a runtime policy, require human approval,
   archive an unused tool, isolate a risky system, increase monitoring). Each is a
   **governed proposal** (`create_recommendation`) carrying its triggering evidence
   — *inert until an operator approves*. Deduped against open recommendations.
4. **Operator queue** (`queue`) — surfaces **only what needs a human**: approvals
   awaiting sign-off, drift to review, incidents to investigate, recommendations to
   accept. Everything else happens automatically. Acknowledging a drift clears the
   queue item but the risk keeps counting until it is resolved.
5. **Executive briefings** (`briefingFor`, daily/weekly/monthly) — what changed,
   what risks increased, what policies triggered, what was blocked, what to approve
   next, and the emerging trends (composed with Runtime Risk Intelligence, §risk).
6. **Monthly evidence packs** (`evidencePack`) — a customer-ready package:
   governance posture, runtime activity, policies enforced, blocked actions,
   executive summary, audit trail, compliance evidence, risk trend and open
   recommendations. The pack is **content-signed** (a SHA-256 of the payload is its
   signature) and persisted (`rg_evidence_packs`) — one click exports it.
7. **Posture across the fleet** (`overview`) — every provisioned enterprise with
   its health, trend, open drift and queue depth, worst-first.

**Principles (never violated).** Monitoring, drift, health and packs are **read-only
projections** over records the platform already owns — nothing here mutates the
estate. **The agent proposes; the operator disposes** — Guardian OS never executes
a privileged action to "fix" drift itself; every recommendation is an inert
governed proposal. Deny-by-default and fail-closed are untouched (no kernel change,
additive tables only); a missing baseline or a read error degrades to *unknown*,
never to *safe*. Proven hermetically by `scripts/ops/managed.test.cjs` (24 checks):
baseline capture, drift detection + idempotency, the seven sub-scores dropping under
drift, governed evidence-backed recommendations, the operator queue, a signed
evidence pack, and the invariants — monitoring never mutates the estate and the
kernel stays deny-only (a privileged wire transfer is still blocked afterwards).

## 17. Executive Workspaces — one twin, many perspectives

Guardian OS becomes the operating system for **every executive** inside an
enterprise. Each executive sees the same governed digital twin through the lens
of their responsibilities. `lib/ops/workspaces.js`, served by
`/api/ops/workspaces`, surfaced in the Control Room **Workspaces** tab.

**One enterprise. One digital twin. One runtime governance engine. Many
perspectives.** The design principle is *no duplicated data*: a workspace is not
a parallel system and not a copy — it is a role-specific **projection** over the
exact same command payload, health score, evidence, drift, policies,
recommendations, performance and estate that every other surface already reads.

**How it works.** `context(org_id)` fetches the shared primitives **once** — the
single source of truth. Each role's `project(ctx)` slices and frames that one
context into sections. `workspace(role, org_id)` builds the context and calls the
projector. Because every lens reads the *same* context, the CEO and the CISO see
the *same* governance score off the *same* twin — they can never disagree.

Seven perspectives ship (each `{ id, title, purpose, project }`):

- **CEO** — strategic: governance confidence, enterprise health, high-priority
  risks, critical approvals, governance trend, cross-department intelligence, the
  executive briefing. Understood in under two minutes.
- **CTO** — technical: runtime health, the AI estate (systems, models, agents,
  APIs, MCP, tools), infrastructure, technical alerts, runtime policies, system
  topology (from the twin's runtime/dependency facets), performance metrics.
- **CISO** — security: threat intelligence, privilege escalations, blocked
  actions, policy violations, trust-boundary changes, runtime attacks (governed
  refusals), the incident timeline, security recommendations, evidence exports.
- **Compliance** — regulatory: compliance posture, evidence packs, audit
  readiness, policy coverage, governance maturity, regulatory mappings, the
  monthly compliance report.
- **COO** — operational: department health, workflow bottlenecks, pending
  approvals, automation effectiveness, operational drift, process efficiency,
  department recommendations.
- **CFO** — financial: AI estate footprint, vendor utilisation, governance ROI
  (derived from real governed-block counts), cost-optimisation opportunities.
- **Legal** — evidence: decision history, policy versions, the approval chain,
  the evidence timeline, signed reports, litigation-ready exports, governance
  attestations (content-hash signed).

**Shared components, shared backend.** Executive briefings, the evidence hub,
runtime governance, recommendations, the digital twin, governance health,
policies, reports and alerts are all reused — only the presentation changes.

**Honesty.** A metric with no real data source (AI spend, revenue-at-risk in
currency, budget forecasts) is surfaced as an explicit `available:false` note
with the reason to connect a source — Guardian OS never fabricates a number it
cannot ground. What *is* grounded (governed blocks → incidents prevented, unused
tools → optimisation) is computed from real records and labelled as derived.

**Extensibility.** Adding an executive workspace is **data-only** — a new `ROLES`
entry — and the Runtime Governance kernel is never touched. Proven hermetically by
`scripts/ops/workspaces.test.cjs` (16 checks): seven role-appropriate lenses, the
*same* governance score + estate count across every lens (one twin, not copies),
the one evidence pack reused across CISO/Compliance/Legal, rendering creates **no
new tables** (pure projection), un-instrumented metrics are honest notes, and an
unknown role is rejected.

## 18. Industry Intelligence Packs — one OS, many sectors

Guardian OS is **one** enterprise operating system on **one** Runtime Governance
kernel. An Industry Intelligence Pack does not fork it, duplicate it, or ship
beside it — a pack only **contributes domain intelligence** that plugs into
services that already exist. `lib/ops/packs/*` + `lib/ops/industry.js`, served by
`/api/ops/industry`, surfaced in the Control Room **Industry** tab.

**What a pack contributes — and where it plugs in:**

| Contribution | Plugs into |
|---|---|
| Ω policies (deny-only) | the dynamic policy engine (§14) — draft → validate → activate, org-scoped |
| Specialised dashboard | a projection over `workspaces.context()` — the **same** shared context (§17) |
| Executive metrics | derived from that one context, never re-queried |
| Recommendations | Managed Governance (§16) — so they flow proposal → Ω → approval → evidence |
| Policy templates | the policy authoring surface |
| Evidence mappings | regulation → control → the evidence that proves it |
| Incident workflows | the incident ledger's domain response |

**Eight packs ship**, each independently versioned: **Healthcare** (clinical AI
governance, patient safety, HIPAA/EU AI Act), **Finance** (payments, trading,
fraud, model risk; SR 11-7/PSD2/DORA), **Cybersecurity** (threat intelligence,
runtime-attack monitoring, privileged-action governance; ISO 27001/SOC 2/NIS2),
**Government** (citizen-service AI, procurement oversight; GDPR Art.22),
**Manufacturing** (robotics governance, operational safety; ISO 10218/IEC 61508),
**Insurance** (claims + underwriting governance; Solvency II), **Retail**
(pricing + customer AI governance), **Education** (student-data governance,
academic AI; FERPA/COPPA).

**Installation is governed and reversible.** `install(org, pack)` runs the pack's
policies through the existing privileged, evidence-backed lifecycle and records
the install (`rg_industry_packs`, versioned). Because pack policies are
**deny-only**, a pack can only ever make the kernel enforce **more** — never less.
`uninstall` rolls those policies back (always allowed, the safety brake), and the
enterprise returns to exactly its pre-pack governed baseline.

**Dynamic loading.** Provisioning suggests the pack matching the enterprise's
industry; installing it immediately gains that domain's intelligence while the
same kernel keeps governing. An installed pack also appears as an additional
**executive perspective** in the Workspaces switcher — still the same twin, just
framed with domain knowledge.

**Never duplicated.** Packs build their dashboards with the shared presentation
vocabulary (`lib/ops/sections.js`) that Executive Workspaces uses, so **one**
Control Room renderer draws every surface and a pack cannot invent its own UI or
data layer. Un-instrumented industry metrics stay honest `note` sections.

**Extensibility.** A new industry — Defence, Energy, Telecommunications,
Logistics, Aviation, Life Sciences, Legal Services — is a **new file in
`lib/ops/packs/`** registered in the pack index. No Guardian OS service changes
and the Runtime Governance kernel is never touched. The registry validates the
pack contract on load, so a malformed pack fails fast rather than half-installing.

Proven hermetically by `scripts/ops/industry.test.cjs` (30 checks): the eight-pack
catalog + contract, the kernel **unchanged** before install and enforcing the
pack's rule after (while unrelated tools still PERMIT), the governed lifecycle +
audit trail, the pack lens showing the **same governance score** as the executive
workspaces (one twin), pack recommendations becoming governed proposals, a clean
rollback to the pre-pack baseline, and rejection of unknown/duplicate installs.

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
