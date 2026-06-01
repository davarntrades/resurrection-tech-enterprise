# 03 — Shot List

Scene-by-scene recording plan. Screens referenced by name are specified in `04-demo-screens.md`. Timecodes are cumulative.

---

### Scene 1 — Opening Hook · 0:00–0:35 · (35s)
- **Screen:** Black canvas; mono agent log types on: `03:47:11Z agent.finance.treasury → initiate_transfer(£25,000, dest: UNVERIFIED)`. Final token `UNVERIFIED` pulses red.
- **Voiceover:** "At 3:47 in the morning…" → "…reach a state you can never allow?"
- **Visual objective:** Establish stakes and unattended autonomy before any branding. Tension, not explanation.
- **Animation:** Type-on at 28 cps; 2s silent hold on first line; red pulse on `UNVERIFIED`.

### Scene 2 — The Problem · 0:35–1:25 · (50s)
- **Screen:** Treasury-agent operations view — a calm dashboard of autonomous actions ticking by (transfers, vendor payments). Cut to three small sector cards: Healthcare, Cybersecurity, Enterprise Operations.
- **Voiceover:** "This is a treasury-operations agent…" → "…faster than any person can review it."
- **Visual objective:** Make the agent real and competent; generalise across regulated sectors.
- **Animation:** Action rows stream upward; sector cards fade in sequentially.

### Scene 3 — Reachable Risk · 1:25–2:30 · (65s)
- **Screen:** "Existing Controls" stack: RBAC · Transaction Monitoring · Human Sampling · Model Guardrails. Each dims and gets a small "reactive / probabilistic" tag as named. A faint red Ω region sits behind, untouched by any control.
- **Voiceover:** "The bank is not careless…" → "…will, eventually, be reached."
- **Visual objective:** Show that current controls never touch reachability; Ω stays lit.
- **Animation:** Sequential dim + tag; final slow zoom toward the still-glowing Ω region.

### Scene 4 — The different idea · 2:30–3:25 · (55s)
- **Screen:** Two plain-English definition cards (Forbidden states Ω / Reachability), then the invariant `R(t) ∩ Ω = ∅` drawing on black, with a one-line gloss: "reachable states never meet forbidden states."
- **Voiceover:** "Runtime Governance starts from a different question…" → "…intercepted before it runs."
- **Visual objective:** Install the only two concepts the demo needs; make the math legible, not intimidating.
- **Animation:** Cards build on cue; invariant strokes on, then the gloss fades under it.

### Scene 5 — The live BLOCK · 3:25–4:45 · (80s)
- **Screen:** `RuntimeGovernanceDemo`, scenario **"Transfer £25,000 to unapproved account."** Pipeline `AI Agent → Validate → Runtime Governance Layer → Execution`. Phases 0–5 play; audit card slides in.
- **Voiceover:** "Let's watch it happen…" → "…hand to a regulator."
- **Visual objective:** The hero moment — interception before execution, with a receipt.
- **Animation:** Phase 3 scan sweep (music drops to silence here); Phase 4 path→red + spring stop marker; Phase 5 audit card `EVT-FIN-097`, risk bar fills to 97%.

### Scene 6 — Before vs After · 4:45–5:45 · (60s)
- **Screen:** Same component, switch to **"Approve mortgage application"** (PERMIT, risk 0.11, path flows through). Then a split-screen lockup: BLOCK trajectory (red, stopped) vs PERMIT trajectory (blue, through).
- **Voiceover:** "Now, the objection every engineer has…" → "…the path into a catastrophic state."
- **Visual objective:** Kill the "it'll block real work" objection; show governance is selective, not a kill switch.
- **Animation:** Permit path flows through gate (green status); split-screen slides the two trajectories together.

### Scene 7 — Audit artifacts · 5:45–6:40 · (55s)
- **Screen:** **Reachable Exposure Report** (ranked Ω states with severity), then **Audit Trail** (Before → Interception → Evidence for one event).
- **Voiceover:** "Risk and security teams don't buy a verdict…" → "…becomes a by-product."
- **Visual objective:** Convert verdicts into regulator-grade evidence; show auditability is automatic.
- **Animation:** Report rows reveal top-down by severity; audit trail builds Before → After with a connecting line.

### Scene 8 — Enterprise Outcome · 6:40–7:20 · (40s)
- **Screen:** `FinancialComparison` executive dashboard (£75K vs £2B+ → 26,666×), then the proof wall: 171/171 · 0.0% FP · 0.0% FN · 129,857+ evaluations · 16/16 multi-agent · Collusion: Verified · Patent GB2600765.8 · GPT/Claude/Gemini/Llama/Mistral.
- **Voiceover:** "Here is what that means at board level…" → "…on a granted patent."
- **Visual objective:** Translate prevention into ROI and defensible proof.
- **Animation:** Multiplier count-up and glow; metric tiles count up in sequence.

### Scene 9 — Closing · 7:20–7:50 · (30s)
- **Screen:** Black. "Don't trust us. Verify it yourself." Then CTA card: **Book a Runtime Safety Assessment** · resurrection-tech.com · `/book#assessment`.
- **Voiceover:** "So we're not going to ask you to trust us…" → "…not an incident to report."
- **Visual objective:** Invert the sell into verification; hand off to one concrete next step.
- **Animation:** Line fades in; CTA button single pulse; end card holds 4s for screenshotting.
