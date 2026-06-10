# assess-agent — Example Reports

Five reference agents run against the **live 95-rule Ω catalog**, grounded through the real engine.
The first four fall inside the covered catalog (finance / cyber / healthcare / multi-agent);
the DeFi agent deliberately carries **AI-native + on-chain capabilities the catalog does not yet
govern**, so it surfaces genuine gaps and the `/onboard-sector` handoff. Reproduce with:

```bash
python .claude/skills/assess-agent/scripts/assess_agent.py \
  --manifest .claude/skills/assess-agent/examples/<manifest>.json --org "<name>"
```

---

## Finance Agent — `openai-functions.json`

# Executive Summary

**Finance Agent — agent governance assessment**

- **Tools assessed:** 6 (4 carry governed-risk capabilities).
- **Ω coverage:** ~100% of risky tools (4 covered, 0 partial, 0 uncovered).
- **Highest-risk trajectories (verified BLOCK before execution):** 4 — e.g. transfer_funds (funds) exercised adversarially → `finance`.
- **Top uncovered areas:** none.
- **Recommended pilot:** govern the finance agent with the live Ω registry.
- **Estimated time-to-value:** days — most tools map to live Ω; a pilot can show pre-execution blocks immediately.


> Of your 6 tools, 4 map to governed Ω domains today, 0 require bespoke Ω extensions, and 4 high-risk trajectories would be blocked before execution.
---

## SOC / Security-Ops Agent — `mcp-tools.json`

# Executive Summary

**SOC / Security-Ops Agent — agent governance assessment**

- **Tools assessed:** 8 (5 carry governed-risk capabilities).
- **Ω coverage:** ~100% of risky tools (5 covered, 0 partial, 0 uncovered).
- **Highest-risk trajectories (verified BLOCK before execution):** 5 — e.g. run_shell_command (execution) exercised adversarially → `cybersecurity`.
- **Top uncovered areas:** none.
- **Recommended pilot:** govern the cybersecurity agent with the live Ω registry.
- **Estimated time-to-value:** days — most tools map to live Ω; a pilot can show pre-execution blocks immediately.


> Of your 8 tools, 5 map to governed Ω domains today, 0 require bespoke Ω extensions, and 5 high-risk trajectories would be blocked before execution.
---

## Healthcare Agent — `langchain-tools.json`

# Executive Summary

**Healthcare Agent — agent governance assessment**

- **Tools assessed:** 6 (4 carry governed-risk capabilities).
- **Ω coverage:** ~100% of risky tools (4 covered, 0 partial, 0 uncovered).
- **Highest-risk trajectories (verified BLOCK before execution):** 2 — e.g. export_phi_dataset (external) exercised adversarially → `data_privacy`.
- **Top uncovered areas:** none.
- **Recommended pilot:** govern the healthcare agent with the live Ω registry.
- **Estimated time-to-value:** days — most tools map to live Ω; a pilot can show pre-execution blocks immediately.


> Of your 6 tools, 4 map to governed Ω domains today, 0 require bespoke Ω extensions, and 2 high-risk trajectories would be blocked before execution.
---

## Multi-Agent Coordinator — `bedrock-tools.json`

# Executive Summary

**Multi-Agent Coordinator — agent governance assessment**

- **Tools assessed:** 6 (4 carry governed-risk capabilities).
- **Ω coverage:** ~100% of risky tools (4 covered, 0 partial, 0 uncovered).
- **Highest-risk trajectories (verified BLOCK before execution):** 7 — e.g. dispatch_subagent (delegation) exercised adversarially → `insurance`.
- **Top uncovered areas:** none.
- **Recommended pilot:** govern the finance agent with the live Ω registry.
- **Estimated time-to-value:** days — most tools map to live Ω; a pilot can show pre-execution blocks immediately.


> Of your 6 tools, 4 map to governed Ω domains today, 0 require bespoke Ω extensions, and 7 high-risk trajectories would be blocked before execution.
---

## Autonomous DeFi / Trading Agent — `defi-autonomous-agent.json`

# Executive Summary

**Autonomous DeFi / Trading Agent — agent governance assessment**

- **Tools assessed:** 8 (6 carry governed-risk capabilities).
- **Ω coverage:** ~33% of risky tools (2 covered, 0 partial, 4 uncovered).
- **Highest-risk trajectories (verified BLOCK before execution):** 4 — e.g. transfer_funds (funds) exercised adversarially → `finance`.
- **Top uncovered areas:** sign_and_broadcast_transaction, execute_swap_on_dex, deploy_smart_contract, place_market_order.
- **Recommended pilot:** govern the digital_assets agent with the live Ω registry, onboarding 4 gap rule(s).
- **Estimated time-to-value:** 1–2 weeks — core coverage live; gaps onboarded as new Ω (under a day each).


> Of your 8 tools, 2 map to governed Ω domains today, 4 require bespoke Ω extensions, and 4 high-risk trajectories would be blocked before execution.
