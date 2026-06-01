# 07 — Demo Assets To Build Next

Build order after the demo ships. Sequenced so each asset unlocks the next and trust compounds. Timelines assume one focused engineer/producer per workstream.

---

### 0. Ship the demo (Week 0–1)
Record and cut this package. Publish to the homepage `#demo` section and a standalone share link. This is the meeting-getter; everything below converts the meetings it generates.

### 1. Open Verifier — `rtg` (Weeks 1–4)
A small, public, reference verifier that loads an Ω definition, evaluates a proposed action against the reachable set, and emits a PERMIT/BLOCK verdict in the same audit-record shape as the demo. Scoped as a *reference* implementation — correct, inspectable, reproducible — not the patented production solver.
- **Why first:** it converts the demo's "show me" into "I checked it myself," and it manufactures third-party scrutiny (forks, researcher attacks) that marketing cannot buy.
- **Done when:** `rtg bench` reproduces **171/171, 0 FP / 0 FN** on a published test set, with a signed report.

### 2. Reproducibility page (Weeks 4–5)
A `/docs` route (currently missing) that links demo → verifier repo → benchmark, with copy-paste commands and expected outputs. The destination for every "are these numbers real?" question.
- **Done when:** a technical evaluator can go from the page to a reproduced benchmark in under ten minutes.

### 3. Tutorial (Weeks 5–7)
The 10–15 minute "run it yourself" walkthrough: install, define Ω in YAML per sector, evaluate, intercept as middleware, reproduce the benchmark. Ends on "Run it yourself."
- **Done when:** a developer can define a new Ω and block their own unsafe trajectory unaided.

### 4. First Audit (Weeks 6–10, parallel)
Use the demo to book a paid **48-hour Runtime Governance Audit (£40K–£75K)** with a design partner in finance. The Reachable Exposure Report (Screen S9) and Audit Trail (S10) are the deliverables — already built for the demo, now run for real.
- **Done when:** one signed engagement and a real reachable-exposure report exists.

### 5. First Case Study (Weeks 10–13)
Productise the first Audit into the banking case study (`Before → Deployment → Result`), labelled and metric-driven. This is the one-pager a CRO forwards internally.
- **Done when:** a forwardable case study with real (or cleanly anonymised) numbers is published.

### 6. Pilot Conversion (Weeks 12–16)
Convert the Audit relationship into a **Structural Safety Pilot (£250K–£750K+, 4–8 weeks)**: Ω defined on client data, interception validated in staging, benchmark reproduced on their traffic — the on-ramp to Integration and Retainer.
- **Done when:** first paid pilot signed.

---

### Critical path
```
Demo ──► Open Verifier ──► Reproducibility Page ──► Tutorial
  │                                                     
  └──► First Audit ──► First Case Study ──► Pilot Conversion
```
The verifier track builds **belief**; the audit track builds **proof**. Run them in parallel from Week 1. Approximate time to first signed pilot: **~16 weeks.**
