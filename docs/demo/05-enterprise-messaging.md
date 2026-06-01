# 05 — Enterprise Messaging Layer

The same demo, read by six different people. Each entry: the one line they remember, the proof point in the demo that earns it, and the metric that anchors it.

---

## CEO — Hard ROI
**Line:** "One prevented event pays for the deployment tens of thousands of times over."
**Earns it:** Scene 8 executive dashboard — £75K assessment against £2B+ reachable exposure.
**Anchor:** **26,666×** cost ratio. Governance cost is bounded; catastrophic exposure is not.

## CIO — Deployment complexity
**Line:** "It sits at the execution boundary as middleware — it does not require rebuilding your agents or your models."
**Earns it:** Scene 5 pipeline (`Agent → Validate → Governance Layer → Execution`) and Scene 6 showing legitimate work flowing through untouched.
**Anchor:** Model-agnostic across **GPT, Claude, Gemini, Llama, Mistral**; phased path **Audit (48h) → Pilot (4–8 wks) → Integration → Retainer.**

## CISO — Security posture
**Line:** "This closes the gap your detective controls can't: it removes the path into the catastrophic state before execution, not after."
**Earns it:** Scene 3 (existing controls are reactive/probabilistic) → Scene 5 (pre-execution interception).
**Anchor:** **0.0% false negatives** — no unsafe trajectory passed governance. Threat coverage **T01–T06**, including multi-agent.

## Head of AI — Technical differentiation
**Line:** "This governs reachability, not output — it enforces `R(t) ∩ Ω = ∅`, which guardrails and filters structurally cannot."
**Earns it:** Scene 4 (the idea) → Scene 5/6 (trajectory evaluation, not response scoring).
**Anchor:** **171/171** with **zero false positives** — selective, not a blunt filter; **16/16** multi-agent collusion blocked.

## Regulator — Auditability
**Line:** "Every governed decision produces a timestamped, attributable record of what was prevented and why."
**Earns it:** Scene 7 — Reachable Exposure Report and the Before→After audit trail.
**Anchor:** One signed audit artifact **per decision**; forbidden states mapped to **FCA / AML / GDPR (Art. 5 / Art. 32)**.

## Board — Catastrophic risk reduction
**Line:** "We did not lower the probability of a catastrophic event. We made the state unreachable by construction — and proved it on our own traffic."
**Earns it:** Scene 6 split-screen (Ω reachable vs unreachable) → Scene 8 proof wall.
**Anchor:** Reachable Ω states identified → removed; **129,857+** governed evaluations; granted patent **GB2600765.8**.
