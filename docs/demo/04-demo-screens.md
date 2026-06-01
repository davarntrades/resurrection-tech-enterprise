# 04 — Demo Screens Required

Every screen the demo needs, with build specs. Tokens: bg `#0b0d10`, governance/safe `#4c7dff`, Ω/forbidden `#e5484d`, OK/permit `#3fb27f`, telemetry Geist Mono. Status legend per screen: ⚫ exists in repo · 🔨 build for demo.

---

## S1 — Agent Activity Log (cold open) · 🔨
Single-column mono log on black. Streaming rows of autonomous actions; the hero row is the £25,000 transfer to an unverified destination.
- **Fields per row:** ISO-UTC timestamp · agent id (`agent.finance.treasury`) · action call · destination flag.
- **State:** `UNVERIFIED` destination renders red; row pulses once on type-on.
- **Build:** static HTML/canvas type-on; no backend.

## S2 — Treasury Agent Operations View · 🔨
Calm "everything is fine" dashboard: a stream of permitted autonomous actions, a throughput counter, a "Human-in-the-loop: none" indicator. Three small sector cards (Healthcare · Cybersecurity · Enterprise Operations) for the generalisation beat.
- **Purpose:** establish a competent, unattended, real deployment.

## S3 — Existing Controls Stack · 🔨
Vertical list: **RBAC · Transaction Monitoring · Human Sampling · Model Guardrails.** Each gains a tag (`reactive` / `probabilistic`) and dims when named. A faint red Ω region glows behind the stack and never dims.
- **Purpose:** show controls reduce likelihood but leave Ω reachable.

## S4 — Concept Cards + Invariant · 🔨
Two definition cards then the invariant.
- **Card A — Forbidden states (Ω):** "Outcomes the system must never reach." Examples: unauthorised transfer · mass data export · unapproved limit breach.
- **Card B — Reachability:** "Whether the system can get there from where it is now."
- **Invariant lockup:** `R(t) ∩ Ω = ∅` with gloss "reachable states never meet forbidden states." Reuse `public/canvas/reach.js` geometry as the backing visual.

## S5 — Runtime Governance Demo (live BLOCK) · ⚫ `components/RuntimeGovernanceDemo.tsx`
Scenario **"Transfer £25,000 to unapproved account."**
- **Pipeline:** `AI Agent → Validate → Runtime Governance Layer [Ω gate · scan sweep · intercept marker] → Execution`.
- **Phase copy (as built):** "Initialising governance evaluation…" → "Agent received request." → "Constructing proposed trajectory…" → "Evaluating reachable future states…" → verdict → audit event.
- **Verdict:** "Execution prevented pre-action."
- **Audit card:** `EVT-FIN-097` · ISO-UTC timestamp · Action: transfer £25,000 → unapproved account · Verdict: **BLOCK** · Reason: **Trajectory intersects Ω: Unauthorized Financial Transfer** · Risk **0.97** (bar fills to 97%).

## S6 — Block Event (regulator card, enlarged) · 🔨 (derived from S5 audit card)
A full-bleed, single-event version of the audit card for the regulator beat.
- **Fields:** Event ID · Timestamp (ISO-UTC) · Action · **Triggered rule / forbidden state detected:** Unauthorized Financial Transfer · Outcomes: Regulatory violation (FCA / AML) · Authorisation failure · Irreversible financial-loss exposure · Risk score 0.97 · Verdict tag `Ω · Block`.

## S7 — Permit Event · ⚫ `components/RuntimeGovernanceDemo.tsx`
Scenario **"Approve mortgage application."**
- **Path:** blue, flows through the gate. Status: **"No forbidden state reachable."** Verdict: **"Execution permitted."** Risk **0.11**. Verdict tag `Permit`.
- **Companion scenario available:** "Read internal policy document" (risk 0.04, "Trajectory remains inside safe region").

## S8 — Before vs After (split trajectory) · 🔨
Two trajectories side by side over one Ω region: left **BLOCK** (red path, intercepted at boundary, risk 0.97); right **PERMIT** (blue path, routes around Ω and executes, risk 0.11). Caption: "Same governance. One path removed."

## S9 — Reachable Exposure Report · 🔨 (audit deliverable)
The artifact of the 48-hour assessment. Ranked table of reachable Ω states.
- **Columns:** Rank · Forbidden state (Ω) · Mapped threat (T01–T06) · Reachability · Exposure level · Risk severity.
- **Seed rows:**
  1. Unauthorized Financial Transfer · T01/T04 · Reachable · £2B+ · Critical (0.97)
  2. Limit breach without approval · T04 · Reachable · High · High (0.81)
  3. PII / customer-database exfiltration · T02 · Reachable · £7.7M–£530M · Critical (0.94)
- **Header:** client · scope · `Σ reachable Ω: 3` · generated ISO-UTC.

## S10 — Audit Trail (Before → After) · 🔨
Three-panel record for one blocked event.
- **Before:** system state + proposed trajectory entering Ω.
- **Interception:** governance verdict BLOCK, pre-execution, with `EVT-FIN-097`.
- **Evidence:** signed record, triggered rule, risk, regulator tags (FCA/AML). Connecting line Before→Interception→Evidence.

## S11 — Executive Dashboard · ⚫ `components/FinancialComparison.tsx`
Risk Exposure Summary: Audit Cost **£75,000** · Reachable Financial Exposure **£2,000,000,000+** · Risk Multiple **26,666×** · Potential Outcome **Prevented Before Execution** · Status **STRUCTURALLY GOVERNED**. Multiplier chips (103× / 136× / 7,067× / 26,666×) and the log-scale bar chart.

## S12 — Proof Wall · ⚫ Homepage `#evidence` / `#validation`
**171/171** test cases · **0.0%** false positives · **0.0%** false negatives · **129,857+** governed evaluations · **16/16** multi-agent · Collusion detection **Verified** · Patent **GB2600765.8** · GPT · Claude · Gemini · Llama · Mistral.

## S13 — Closing / CTA · 🔨
Black. "Don't trust us. Verify it yourself." → CTA card **Book a Runtime Safety Assessment** · resurrection-tech.com · `/book#assessment`. Hold 4s.

---

### Build queue (only the 🔨 items)
S1, S2, S3, S4, S6, S8, S9, S10, S13. S9 (Reachable Exposure Report) and S10 (Audit Trail) are the two that double as **real audit deliverables** — build them as product, not slides, and they are reusable in every engagement.
