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
| **Engine reachable from your delivery environment** | ✅ | Verified in Colab — `/v1/assess` + `/v1/evaluate` reachable, audit run started. (Blocked only inside the build sandbox.) |
| **Portable Chromium discovery for PDF rendering** | ✅ | `CHROME_BIN` → common paths → bundled; clear error if absent. `--check-chrome` to verify. |

## 2. Can I generate the audit within 48 hours?

| Item | Status | Notes |
|---|---|---|
| Automated Ω coverage + exposure (`/v1/assess`) | ✅ | **Verified** on the Meridian end-to-end run |
| Automated verified-blocked-trajectories + hashes | ✅ | `grounded_blocks` populated on the run |
| Automated ALLOW/BLOCK/ESCALATE stats (`/v1/evaluate`) | ✅ | Verified — 8 trajectories replayed |
| Automated prevented categories | ✅ | Populated from blocked verdicts |
| Automated replay/determinism verification | ✅ | **8/8 deterministic** on the run |
| Attestation capture (engine commit, ruleset hash) | ✅ | Present on the run |
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
| **Governance engine `/v1/assess` + `/v1/evaluate`** | ✅ | Verified reachable in Colab |
| `GOVERNANCE_TOKEN` valid for `/v1/evaluate` | ✅ | Confirmed via Colab `--check` |
| **Chromium for PDF rendering** | ✅ | Portable discovery; install chromium or set `CHROME_BIN` in your run env |

## 4. What is still missing?

| Gap | Status | Effort |
|---|---|---|
| Run ONE full end-to-end (engine + Chromium) — all fields ✅ | ✅ | **Done** — Meridian Health Systems run: 11/11 fields ✅, replay 8/8, audit.pdf + executive-report.pdf + run-summary.json produced |
| Eyeball the populated PDFs for content quality on a *real* customer manifest | 🟡 | ~1 hr — sample passed; swap in the real customer's manifest and read the output before sending |
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

### Status — GO ✅
Verified end-to-end in a Codespace: engine reachable, Chromium portable, and a
full healthcare run produced **all 11 Priority-1 fields ✅** with **8/8 replay
determinism** and three deliverables. **The pipeline is delivery-ready.**

Remaining before invoicing a specific customer (none are engineering blockers):
1. Run with the **real customer's manifest** and read the output PDFs (~1 hr).
2. Confirm engine-default Ω is acceptable for them, or scope custom Ω as a pilot.
3. 1-page SOW / engagement letter (~0.5 day).
4. Per engagement: analyst review + read-out call (~0.5–1.5 day).
