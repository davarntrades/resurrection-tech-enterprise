# 01 — Demo Narrative

The story flow, in nine scenes. Every other asset in this package is keyed to this structure.

---

## Arc

A regulator-grade walk from **stakes → why today's controls fail → the different idea → the system doing its job → the proof → verify it yourself.** The viewer is never asked to trust a claim they have not just watched happen.

---

## Scene 1 — Opening Hook (0:00–0:35)

Black screen. A live agent log types itself out: an autonomous treasury agent initiating a £25,000 transfer at 03:47, unattended. One question lands:

> **"What happens when an autonomous agent can reach a catastrophic state?"**

No logo yet. No pitch. Just the moment before the money moves.

## Scene 2 — The Problem: a realistic enterprise agent (0:35–1:25)

Introduce a real deployment, not a toy. A bank's autonomous **treasury-operations agent** handles intra-day liquidity and vendor payments — it acts without a human in the loop, by design, thousands of times a day. The same shape exists in healthcare (discharge / medication agents), cybersecurity (credential and shell-execution agents), and enterprise operations. The agent is competent. That is precisely the problem: it can act, irreversibly, faster than anyone can review.

## Scene 3 — Reachable Risk: why existing controls fail (1:25–2:30)

Lay out what the bank already has: role-based access, post-hoc transaction monitoring, human sampling, model-level guardrails. Then the uncomfortable truth: every one of those controls is **reactive or probabilistic**. Monitoring fires after settlement. Sampling inspects a fraction. Guardrails live inside the model and erode with every model update. None of them change one fact — **the forbidden state is still reachable.** And a state that is reachable will eventually be reached.

## Scene 4 — The different idea: reachability and forbidden states (2:30–3:25)

Define the two words the rest of the demo depends on, in plain English.

- **Forbidden states (Ω):** the outcomes the system must never reach — an unauthorised transfer, a mass data export, an unapproved limit breach. Not bad words; bad *destinations*.
- **Reachability:** whether the system can get to one of those destinations from where it is now.

Then the invariant, stated once, simply: governance holds the reachable set and the forbidden set apart — `R(t) ∩ Ω = ∅` — by intercepting any trajectory that would cross into Ω, **before** it executes.

## Scene 5 — Runtime Governance intercepts: the live BLOCK (3:25–4:45)

The product, live. The £25,000 transfer enters the governance layer. The system constructs the agent's proposed trajectory, evaluates the reachable future states, and finds the path intersects Ω: *Unauthorized Financial Transfer*, risk 0.97. The trajectory turns red. Execution is stopped **pre-action**, and a timestamped audit record is written. The money never moved.

## Scene 6 — Before vs After: reachable Ω vs unreachable Ω (4:45–5:45)

The fear with any control is that it blocks real work. So show the other half. A legitimate **mortgage approval** enters the same layer and flows straight through — risk 0.11, no forbidden state reachable, permitted. Side by side: the same governance, one trajectory routed around Ω, one intercepted at Ω. Safe work is never slowed; only the path into a catastrophic state is removed.

## Scene 7 — Audit artifacts (5:45–6:40)

Risk leaders do not buy verdicts; they buy evidence. Show the **Reachable Exposure Report** the 48-hour audit produces — the forbidden states ranked by severity — and the **Audit Trail**: the before/after record for a single blocked event, regulator-ready, one artifact per decision.

## Scene 8 — Enterprise Outcome (6:40–7:20)

The board view. A single catastrophic event modelled at £2B+ of exposure, removed for the price of a £75K assessment — a 26,666× asymmetry. Then the proof wall: 171/171 test cases, zero false positives, zero false negatives, across every major model family, multi-agent collusion included, on a granted patent.

## Scene 9 — Closing (7:20–7:50)

No hard sell. The opposite:

> **"Don't trust us. Verify it yourself."**

The next step is concrete and small: a Runtime Safety Assessment that tells you which catastrophic states are reachable in your system today — before they become a business event.
