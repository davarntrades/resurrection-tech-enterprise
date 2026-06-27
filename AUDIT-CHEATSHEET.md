# 🏁 Audit Cheat Sheet — run an audit in under 2 minutes

The fastest, repeatable way to produce the **Audit PDF + Executive Report PDF + run-summary.json**
from a customer manifest. Two ways: the **Console** (point-and-click) or the **CLI** (one command).

---

## ⚡ First time only (per machine / Codespace)
```bash
npm run audit:setup            # installs deps + Chromium, creates .env.delivery
echo 'GOVERNANCE_TOKEN=YOUR_ENGINE_TOKEN' >> .env.delivery   # needed for the exec-report replay
npm run audit:check            # expect: engine reachable ✓ · Chromium found ✓
```
If you ever see `Chromium not found`: `npm run audit:chrome:install` then `npm run audit:selftest`.

---

## 🖥️ Option A — Console (recommended: Upload → Run → Review → Deliver)
```bash
npm run console                # → http://127.0.0.1:8787
```
- First run prints a username/password (saved to `.env.delivery`) — use it at the login prompt.
- In Codespaces: open port **8787** from the **Ports** tab (set it **Public** to share links).
- Then: **Create engagement → upload/paste manifest → Run Runtime Governance Audit → Preview/Download → Share securely.**

---

## 🚀 Option B — CLI (one command per audit)
```bash
npm run audit -- --manifest customer-tools.json \
  --name "Customer Name" --industry Healthcare \
  --period "June 2026" --reference RT-CUST-2026-001 \
  --domains healthcare,finance --open
```
For a **fully-populated Executive Report** (latency + ALLOW/BLOCK/ESCALATE + determinism), add trajectories:
```bash
  --trajectories trajectories.json     # JSON: [[{"tool":"delete_record","args":{}}], ...]
```

**Output** lands in `deliverables/<customer>-<period>/`:
`audit.pdf` · `executive-report.pdf` · `run-summary.json`

The run prints a field matrix: ✅ present · ⏳ pending live evidence (by design) · 🔴 missing (check engine).

---

## 📦 Report modes (automatic — never fabricated)
- **No trajectories →** Executive Report shows **Deployment Ready** (structural evidence + readiness checklist).
- **With trajectories →** **Live Runtime Evidence** (runtime stats + measured **Runtime Performance** + `PERFORMANCE VERIFIED ✓`).

---

## 🔐 Deliver securely
In the Console, click **Share securely** on a PDF → set expiry (1–90 days) + optional password →
copy the `/share/<token>` link. Customers open it with **no login**; revoke anytime under **Secure delivery links**.

---

## 🆘 Quick fixes
| Symptom | Fix |
|---|---|
| Console won't start | Set `ANALYST_USER` + `ANALYST_PASSWORD` in `.env.delivery` (or just `npm run console` — it auto-provisions) |
| `Chromium not found` | `npm run audit:chrome:install` → `npm run audit:selftest` |
| Exec report fields blank | Set `GOVERNANCE_TOKEN` + pass `--trajectories` (or upload them in the Console) |
| Engine unreachable | `npm run audit:check` — confirms `/v1/assess` + `/v1/evaluate` |

Full docs: `DELIVERY-QUICKSTART.md` · `console/README.md` · `PLATFORM-PLAN.md`
