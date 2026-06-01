# 02 — Voiceover Script

Every spoken word. ~7:50 at ~140 wpm. One neutral institutional voice. No hype, no buzzwords. `[ ]` are timing/delivery cues, not spoken.

---

### Scene 1 — Opening Hook (0:00–0:35)

[Black. Only the agent log types on screen. Let the first line land in silence for two seconds before speaking.]

At 3:47 in the morning, an autonomous agent did exactly what it was built to do. It started a transfer. Twenty-five thousand pounds, to an account no human had verified.

[beat]

No one approved it. No one was watching. It didn't need them to be.

So here is the question every organisation deploying autonomous systems now has to answer:

What happens when an agent can reach a state you can never allow?

---

### Scene 2 — The Problem (0:35–1:25)

[Fade up the treasury agent view.]

This is a treasury-operations agent at a bank. It manages intra-day liquidity and pays vendors — thousands of decisions a day, with no human in the loop. That isn't a flaw. That's the point of deploying it.

The same pattern is everywhere autonomous systems are now running. In healthcare, agents handle discharge and medication workflows. In security, they manage credentials and execute commands. In operations, they move money, data, and infrastructure on their own.

These systems are capable. And that is exactly what makes them dangerous. They can take an irreversible action faster than any person can review it.

---

### Scene 3 — Reachable Risk (1:25–2:30)

[Show the stack of existing controls, then dim each as it's named.]

The bank is not careless. It has controls. Role-based access. Transaction monitoring. Human review on a sample of activity. Guardrails built into the model itself.

But look at what those controls actually do. Monitoring tells you about a transfer after it has settled. Sampling inspects a fraction and trusts the rest. And guardrails inside the model degrade every time the model is updated.

Every one of these is reactive, or it's a matter of probability. None of them changes the one fact that matters: the catastrophic state is still reachable.

[slower]

And a state that is reachable will, eventually, be reached.

---

### Scene 4 — The different idea (2:30–3:25)

[Plain-language definitions appear as spoken. Then the invariant.]

Runtime Governance starts from a different question. Not "was the output bad?" — but "can the system get somewhere it must never be?"

Two ideas, in plain terms.

A forbidden state is an outcome you can never permit. An unauthorised transfer. A mass export of customer data. A limit breach with no approval. Not bad words — bad destinations. We call that set Ω.

Reachability is simply whether the system can get to one of those destinations from where it is right now.

[the invariant draws on screen: R(t) ∩ Ω = ∅]

Governance does one thing: it keeps the set of states you can reach, and the set of states you've forbidden, from ever touching. Any path that would cross into Ω is intercepted before it runs.

---

### Scene 5 — The live BLOCK (3:25–4:45)

[Live RuntimeGovernanceDemo. Scenario: "Transfer £25,000 to unapproved account."]

Let's watch it happen. Same transfer. This time the agent sits behind the governance layer.

[as phases play] The request comes in. The system constructs the agent's proposed trajectory — not what it said, what it would do — and evaluates the future states that path can reach.

[the scan sweep runs; let the music fall away]

The trajectory intersects Ω. Unauthorized financial transfer. Risk, point nine seven.

[the path turns red, the stop marker snaps in]

Execution prevented — before the action. The money never moved. And the system writes a record: event ID, timestamp, the forbidden state it detected, and why. A receipt you can hand to a regulator.

---

### Scene 6 — Before vs After (4:45–5:45)

[Switch scenario: "Approve mortgage application."]

Now, the objection every engineer has by this point: does this just block everything and slow my business down?

Watch. A different action — approving a legitimate mortgage — enters the exact same layer.

[the path stays blue and flows through]

Risk, point one one. No forbidden state reachable. Permitted. It runs.

[split screen: the two trajectories]

This is the whole idea on one screen. Same governance. One path routes cleanly around Ω and executes. The other is stopped at the boundary. Legitimate work is never delayed. The only thing removed is the path into a catastrophic state.

---

### Scene 7 — Audit artifacts (5:45–6:40)

[Reachable Exposure Report, then Audit Trail.]

Risk and security teams don't buy a verdict. They buy evidence. So here is what the system produces.

This is a Reachable Exposure Report. Before anything is deployed, a forty-eight-hour assessment maps which forbidden states are actually reachable in your system, and ranks them by severity. You see your exposure as a list, not a surprise.

And this is the audit trail for a single blocked event. The state before. The interception. The evidence. One record, per decision, automatically. Your auditability stops being a project and becomes a by-product.

---

### Scene 8 — Enterprise Outcome (6:40–7:20)

[Executive exposure dashboard, then the proof wall.]

Here is what that means at board level.

A single unauthorised transfer has cost institutions two billion pounds and more. The assessment that identifies and removes that reachable path costs seventy-five thousand. That is a difference of more than twenty-six thousand times.

And these are not our assertions to take on faith. One hundred and seventy-one of one hundred and seventy-one test cases passed. Zero unsafe trajectories got through. Zero safe ones were wrongly blocked. Across GPT, Claude, Gemini, Llama and Mistral. Including multi-agent collusion. On a granted patent.

---

### Scene 9 — Closing (7:20–7:50)

[Black. One line, then the CTA.]

So we're not going to ask you to trust us.

Don't trust us. Verify it yourself.

The next step is small, and it's concrete: a Runtime Safety Assessment. In forty-eight hours, it tells you exactly which catastrophic states are reachable in your system today — while there is still a decision to make, and not an incident to report.

[CTA card: Book a Runtime Safety Assessment — resurrection-tech.com]
