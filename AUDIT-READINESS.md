# Audit Readiness Checklist — 48-Hour Runtime Governance Audit

Operational readiness to deliver a paid £40K–£75K audit. Status keys:
**✅ Complete · 🟡 Needs validation · 🔴 Missing/blocked**

> One-command preflight before any engagement:
> `GOVERNANCE_URL=… GOVERNANCE_TOKEN=… node scripts/delivery-kit.cjs --check`
> Run a full engagement:
> `node scripts/delivery-kit.cjs path/to/customer.json`

---

## 1. Can I accept a customer tomorrow?

| Item | Status | Notes |
|---|---|---|
| Pipeline exists end-to-end (manifest → Audit + Executive PDFs) | ✅ | `scripts/delivery-kit.cjs`, verified producing artifacts |
| Intake format defined | ✅ | JSON: `customer`, `manifest`/`manifest_text`, `trajectories`/`decisions` |
| Accepts customer's *raw* manifest (OpenAI/MCP/etc.) | ✅ | `manifest_text` + `format` passed straight to the engine — no reshaping |
| Branded Audit PDF generator | ✅ | Chromium pipeline, dark/gold brand |
| Branded Executive Report PDF generator | ✅ | same pipeline |
| Pricing / engagement positioning public | ✅ | `/enterprise-pathways`, `/sample-audit` |
| Commercial: SOW / engagement letter template | 🟡 | Pricing is public; a signable 1-page SOW would speed close (≈0.5 day) |
| **Engine reachable from your delivery environment** | 🔴 *(unverified here)* | Sandbox egress blocks the engine host (403). **Must run `--check` from your machine/Vercel/server.** This is the gate. |

## 2. Can I generate the audit within 48 hours?

| Item | Status | Notes |
|---|---|---|
| Automated Ω coverage + exposure (`/v1/assess`) | 🟡 | Code done; live output **unverified** (engine unreachable here) |
| Automated verified-blocked-trajectories + hashes | 🟡 | From `/v1/assess.grounded_blocks`; unverified live |
| Automated ALLOW/BLOCK/ESCALATE stats (`/v1/evaluate`) | 🟡 | Code done; unverified live |
| Automated prevented categories | 🟡 | Derived from blocked verdicts |
| Automated replay/determinism verification | ✅ (code) 🟡 (live) | Each trajectory evaluated twice and compared |
| Attestation capture (engine commit, ruleset hash) | 🟡 | From `/v1/assess.attestation`; unverified live |
| Recommendations | ✅ | Generated |
| PDF rendering time | ✅ | Seconds |
| Analyst review + read-out | ✅ (process) | ~0.5–1.5 day human time per engagement |

## 3. Is every dependency working?

| Dependency | Status | Notes |
|---|---|---|
| Chromium / PDF pipeline | ✅ | Produces both PDFs reliably |
| Node runtime + script | ✅ | `node -c` clean; runs end-to-end |
| Field-validation matrix + `run-summary.json` | ✅ | Every Priority-1 field marked present/missing per run |
| Preflight `--check` | ✅ | Probes both endpoints + lists fields |
| **Governance engine `/v1/assess` + `/v1/evaluate`** | 🔴 *(unverified)* | Blocked from this environment; **verify from a connected one** |
| `GOVERNANCE_TOKEN` valid for `/v1/evaluate` | 🟡 | Set + confirm via `--check` |

## 4. What is still missing?

| Gap | Status | Effort |
|---|---|---|
| Confirm engine returns all fields for a **real** manifest | 🔴 | ~2–4 hrs (run `--check` + one real manifest from a connected env) |
| Decide Ω model for first customer (engine defaults vs custom) | 🟡 | ~0.5 day — **defaults are sufficient for a first audit**; custom Ω is pilot-depth |
| Signable SOW / engagement letter | 🟡 | ~0.5 day |
| (Optional) customer intake form to collect the manifest | 🟡 | not required — email a JSON/file works |

## 5. How long would each remaining task take?

| Task | Estimate |
|---|---|
| Verify engine round-trip from delivery env (`--check`) | 2–4 hrs |
| One real-manifest dry-run + eyeball the PDFs | 2–4 hrs |
| Confirm Ω-defaults adequate (or note custom-Ω as upsell) | 0.5 day |
| SOW template | 0.5 day |
| **Total one-time prep to first delivery** | **~1–2 engineering days** |
| Per-audit human time thereafter | ~0.5–1.5 day |

---

### Manual steps remaining (Priority 2 target)
Automated: assess, evaluate, replay/determinism, metrics, categories, recommendations, attestation capture, both PDFs, evidence JSON, field validation.
**Manual (by design):** (1) receive customer info, (2) review the generated report, (3) present findings. ✅ matches target.

### The single gate
Everything except **live engine reachability + field completeness** is ✅ or a sub-day task. That one item is 🔴 *only because it cannot be tested from this build sandbox* — run `node scripts/delivery-kit.cjs --check` from an environment that can reach the engine and it flips to ✅ or tells you the exact missing field.
