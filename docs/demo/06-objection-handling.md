# 06 — Objection Handling

Concise, enterprise-grade responses. Each pairs a one-line answer with the demo moment or metric that backs it.

---

### "Why not build this internally?"
Reachability-based governance is a different discipline from rule-writing — it evaluates the set of states a trajectory can reach, not the text of an output. It is patented (**GB2600765.8**) and validated across **129,857+ evaluations** with **zero false negatives**; reproducing that internally is a multi-year research effort with no benchmark to check yourself against. We give you the outcome now, and a benchmark you can run yourself. *(Scene 4, Scene 8.)*

### "Does this slow developers down?"
No. Governance only acts on trajectories that would reach a forbidden state. Legitimate actions pass through with no friction — you watched a mortgage approval execute at risk 0.11. With **0.0% false positives** across all governed evaluations, your engineers don't experience governance until something genuinely tries to enter Ω. *(Scene 6.)*

### "How long does deployment take?"
A **48-hour** Runtime Governance Audit tells you which catastrophic states are reachable today. A Structural Safety Pilot validates interception on your own traffic in **4–8 weeks**. Integration embeds it at the production boundary; the retainer keeps Ω current as models, tools, and regulations change. *(Engagement model.)*

### "What is the ROI?"
The assessment costs **£75K**. A single unauthorised transfer has cost institutions **£2B+**. That is a **26,666×** asymmetry, and it holds across sectors — PHI breach 103×, credential exposure 136×, GDPR fine 7,067×. One prevented event pays for the deployment many times over. *(Scene 8.)*

### "What if your system fails?"
Governance is fail-closed: if a trajectory cannot be shown to keep `R(t) ∩ Ω = ∅`, it is not permitted to execute. Every decision is recorded, so failures are auditable, not silent. And you don't take this on faith — the published benchmark (**171/171**, 0 FP / 0 FN) is reproducible, and the open verifier lets you try to get an unsafe trajectory through yourself. *(Scene 9.)*

### "How does this integrate with existing tools?"
It runs as middleware at the agent's execution boundary — a thin wrapper around tool calls — and is model-agnostic across **GPT, Claude, Gemini, Llama, Mistral**. It sits alongside your existing controls rather than replacing them: RBAC and monitoring stay; governance adds the pre-execution layer they lack. *(Scene 5.)*

### "What makes this different from guardrails?"
Guardrails inspect inputs and outputs and live inside the model — they degrade with every model update and only ever see one step. Runtime Governance evaluates the **reachable future states** of a trajectory at the execution boundary, independent of the model, and intercepts before the action runs. Guardrails ask "was that output bad?"; governance asks "can the system reach a state it must never reach?" *(Scene 3 → Scene 4.)*
