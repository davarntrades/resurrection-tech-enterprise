# Post-merge checklist — Test Without Your Own Agent

Milestone merged to `main`: real Hugging Face planner pathway → live Runtime
Governance evaluation, the `/test-without-agent` page, "Generate Your Own
Scenario", "Share This Result", server-side token safety, and live/fallback
provenance badges.

Run these once after the production deploy completes.

### Production env prerequisites (Vercel → Project → Settings → Environment Variables)
- `GOVERNANCE_URL` and `GOVERNANCE_TOKEN` — required for **live** verdicts
  (`source=morrison`). Without the token the engine returns `401`, which fails
  closed to the labelled heuristic (no live badge).
- `HF_API_TOKEN` (optional) — enables the real Hugging Face planner in "Generate
  Your Own Scenario". Without it, the trajectory comes from the clearly-labelled
  keyword fallback (the governance verdict is still live).
- `PLANNER_MODEL` (optional) — defaults to `Qwen/Qwen2.5-0.5B-Instruct`.
- These are **server-only** — never `NEXT_PUBLIC_*`.

### Checklist
1. **Confirm page works in production** — open `https://resurrection-tech.com/test-without-agent`; it returns 200 and renders the hero + three paths.
2. **Confirm `/test-without-agent` loads from nav** — Menu → *Solutions* and *Evidence* → "Test without your own agent" navigates to the page.
3. **Run one sample scenario** — pick a scenario tab → "Send to Runtime Governance" → verdict + execution decision appear.
4. **Run one custom scenario** — in "Generate your own scenario", type a task (or click an example) → "Generate & evaluate" → trajectory + verdict appear.
5. **Confirm `LIVE ENGINE VALIDATED` badge** appears when `source=morrison` (requires `GOVERNANCE_URL`/`GOVERNANCE_TOKEN`). If you see "HEURISTIC FALLBACK", the engine was unreachable or auth failed — check the env vars.
6. **Confirm no tokens exposed client-side** — DevTools → Network: browser calls go only to `/api/evaluate-trajectory` and `/api/plan-and-evaluate` (no `Authorization` header from the browser, no `GOVERNANCE_TOKEN`/`HF_API_TOKEN` in any response, page source, or JS bundle).
7. **Confirm CTA links work** — "Open in Colab", GitHub notebook/script links, Assess (`/assess`), Book (`/book#assessment`), and the Share controls (Copy shareable link → opens `/test-without-agent/report?r=…`, Open report, Download PDF → print dialog).

### Notes
- The report page (`/test-without-agent/report`) is `noindex`; shareable links
  carry the result in the URL (`?r=`) with no server-side payload storage.
- Verdicts are always the live engine's — never hardcoded. Provenance is shown
  on two axes: governance (live vs fallback) and planner (HF vs keyword).
