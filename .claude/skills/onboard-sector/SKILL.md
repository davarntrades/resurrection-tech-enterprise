---
name: onboard-sector
description: >
  Rapidly stand up a new governed Ω domain (vertical) for Morrison Runtime
  Governance — the "scale by changing Ω, not geometry" motion. Given a sector
  name and optional threat model / protected assets / regulations / tool
  inventory, it scaffolds Ω definitions, deployment rule skeletons (following the
  existing sector_rules.py patterns and reusing the cross-domain governance
  patterns), an adversarial + benign evaluation corpus in the repo's corpus.json
  format, a benchmark template, documentation, and a step-by-step deployment
  checklist. Use to launch a new pilot vertical or a bespoke customer Ω. Trigger
  phrases: "onboard sector", "new Ω domain", "stand up a vertical",
  "/onboard-sector healthcare".
---

# onboard-sector

Scaffolds everything needed to add a new sector the same way the eight live
sectors were added — geometry untouched, Ω expands. It writes a review-ready
package; it does **not** modify existing files (production-safe), so you
integrate via the generated checklist.

## When to use
- Launching a new vertical (e.g. biometrics, legal, pharma) or a customer-specific Ω.
- Turning a prospect's threat model into governed rules + a corpus fast.

## How to run
```bash
python .claude/skills/onboard-sector/scripts/onboard_sector.py <name> \
  --tools enroll_template,match_face,delete_template \
  --assets "Biometric templates,Identity records" \
  --regs "GDPR,BIPA" \
  --threats "template theft,presentation spoofing,unauthorized enrollment" \
  --out governance-service/sectors_scaffold
# or pass a spec file: --spec sector.json   (keys: tools, assets, regs, threats)
```

Examples: `/onboard-sector finance` · `/onboard-sector healthcare` ·
`/onboard-sector defence` · `/onboard-sector enterprise` · `/onboard-sector biometrics`

## Generates (`<out>/<name>/`)
- `omega.md` — Ω forbidden-state definitions for the sector.
- `<name>_rules.py` — deployment rule skeletons (paste-ready for `sector_rules.py`),
  reusing the shared helpers + cross-domain patterns, plus sector-specific Ω checks.
- `corpus_<name>.json` — labelled adversarial (BLOCK) + benign (PERMIT) cases in
  `tests/corpus.json` format.
- `benchmark_<name>.md` — how to fold the sector into `benchmark.py`.
- `README.md` — sector overview + threat-model → Ω mapping.
- `DEPLOYMENT_CHECKLIST.md` — exact integration steps (engine enum + DEFAULT_RULES
  + omega_registry + presets, deployment rules, website `SECTOR_DOMAINS`, corpus
  merge, tests, `verify-production`).

## Convention (matches the live sectors)
Sector-specific control actions are deny-by-default unless an explicit
authorisation/verification flag is present; the reusable cross-domain patterns
(approval spoofing, role/privilege escalation, state-transition abuse, sensitive
egress, unauthorised delegation) are reused, not re-implemented.

## Reuses
`governance-service/sector_rules.py` patterns, `tests/corpus.json` format, the
`Domain Strategy.md` framing, and integrates with `verify-production` /
`generate-audit-pack`.
