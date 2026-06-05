# Engine patches

Patches to apply to the upstream engine repo
(`davarntrades/Morrison-Runtime-Governance`) that this service depends on. They
are kept here because that repo is vendored at build time (see `../Dockerfile`)
and is outside this repo's CI/push scope.

## `0001-add-target-sector-omega-domains.patch`

Adds eight target-sector values to the `OmegaDomain` enum: `insurance`,
`government`, `supply_chain`, `energy`, `telecommunications`, `manufacturing`,
`aerospace`, `defence`.

That is the **only** engine change required to make these sectors live. The Ω
rule logic itself lives in this repo as deployment `custom_rules`
(`../sector_rules.py`) and is attributed to these enum values — the same pattern
the validation report sanctions ("an `OmegaDomain` enum value **or**
`CUSTOM`-scoped rules"). No `DEFAULT_RULES` factory is needed.

### Apply

```bash
git clone https://github.com/davarntrades/Morrison-Runtime-Governance.git
cd Morrison-Runtime-Governance
git apply /path/to/0001-add-target-sector-omega-domains.patch
# review, commit, push to main (or your pinned ENGINE_REF)
```

### Why this is safe to merge here before the engine ships

`sector_rules.py` resolves each sector's enum member with `getattr` and skips
any the running engine doesn't define, so on the current engine it contributes
**zero** rules and raises no import error. The corpus / hardening tests skip
sector cases whose domain the engine lacks. So this repo stays green and the
deployed service is unchanged until the engine enum ships.

## Rollout sequence

1. **Merge this repo's PR.** No behavioural change in production: the API still
   422s on sector domains (correct), the demo keeps sectors in the disabled
   "Ω rules pending" group, and CI skips the sector cases.
2. **Apply this patch** to `Morrison-Runtime-Governance` and push to the branch
   referenced by `ENGINE_REF` (default `main`). Re-run **Deploy
   governance-service** (or push any `governance-service/**` change). The
   corpus gate now *evaluates* the sector cases (no longer skipped) and the
   deployed service accepts the sector domains, attributing verdicts to the
   correct sector Ω domain. `/health` reports them under `live_sectors`.
3. **Flip the website flag.** Set `NEXT_PUBLIC_SECTORS_LIVE=true` in Vercel
   (Production) and redeploy. The Live Demo's Custom Evaluation selector then
   lists the sectors under "Live — real Ω rules" and sends them to the engine.
