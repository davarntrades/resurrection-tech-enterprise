#!/usr/bin/env python3
"""onboard-sector — scaffold a new governed Ω domain for Morrison Runtime
Governance. See ../SKILL.md. Writes a review-ready package; modifies nothing."""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import re


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9_]+", "_", s.strip().lower()).strip("_")


def const(s: str) -> str:
    return slug(s).upper()


def load_spec(a) -> dict:
    spec = {}
    if a.spec and os.path.isfile(a.spec):
        spec = json.load(open(a.spec))
    def lst(v):
        return [x.strip() for x in v.split(",")] if v else []
    return {
        "tools": spec.get("tools") or lst(a.tools) or [f"{slug(a.name)}_control_action"],
        "assets": spec.get("assets") or lst(a.assets) or ["Sensitive sector records"],
        "regs": spec.get("regs") or lst(a.regs) or ["<applicable regulation>"],
        "threats": spec.get("threats") or lst(a.threats) or
                   ["unauthorized control action", "sensitive data egress", "approval bypass"],
    }


# ── templates ────────────────────────────────────────────────────────────────

def omega_md(name, s):
    rows = "\n".join(f"- **{slug(t)}_without_authorization** — {t} executed without an explicit "
                     f"authorisation/verification flag." for t in s["tools"])
    return f"""# Ω definitions — {name.title()}

> The geometry does not change. Only Ω changes. ℛ(t) ∩ Ω = ∅.

**Protected assets:** {", ".join(s['assets'])}
**Regulatory context:** {", ".join(s['regs'])}

## Sector-specific Ω (forbidden states)
{rows}

## Reused cross-domain Ω (attributed to this sector)
- approval_spoofing — fabricated / bypassed human approval.
- role_escalation — role/privilege escalation without authorisation.
- state_transition_abuse — privileged change after a verify step, no re-authorisation.
- sensitive_egress — sensitive/classified data egressed externally without sanitisation.
- unauthorized_delegation — multi-agent hand-off without authorisation or scope.
"""


def rules_py(name, s):
    NAME = const(name)
    tools = ", ".join(f'"{slug(t)}"' for t in s["tools"])
    checks, specs = [], []
    for t in s["tools"]:
        fn = f"_{slug(name)}_{slug(t)}_unauthorized"
        checks.append(
            f"def {fn}(s: dict) -> bool:\n"
            f"    # Deny-by-default: {t} without an explicit authorisation/verification flag.\n"
            f"    return _tool(s) in {NAME}_CONTROL and _unauthorized(s, \"authorized\", \"approved\", \"verified\")\n"
        )
        specs.append(f'    ("{slug(name)}_{slug(t)}_without_authorization",\n'
                     f'     "{t} executed without authorisation",\n'
                     f'     {fn}),')
    return f'''"""Deployment Ω rules — {name.title()} sector (SCAFFOLD).

Paste these into governance-service/sector_rules.py:
  • add the tool-vocabulary set(s) near the other sector vocabularies,
  • add the check function(s),
  • append the ("{NAME}", [...]) block to _SECTOR_RULES.

Reuses the existing helpers (_tool, _unauthorized, _is_external, _flag_true).
The reusable cross-domain patterns (approval spoofing, role escalation,
state-transition abuse, sensitive egress, unauthorised delegation) are provided
by the engine's {NAME} default rules — do NOT re-implement them here.
"""

# These helpers already exist in sector_rules.py; this import is satisfied on
# integration (paste the bodies into that module). Left as a comment so the
# scaffold stays valid, paste-ready Python.
# from sector_rules import _tool, _unauthorized  # noqa

# ── Tool vocabulary (lower-cased, exact tool-name match) ──
{NAME}_CONTROL = {{{tools}}}


# ── Sector-specific checks (use the shared helpers from sector_rules.py) ──
{chr(10).join(checks)}

# ── Append this entry to _SECTOR_RULES in sector_rules.py ──
SECTOR_RULES_ENTRY = ("{NAME}", [
{chr(10).join(specs)}
])
'''


def corpus_json(name, s):
    cases = []
    dom = slug(name)
    for t in s["tools"]:
        cases.append({"id": f"{dom}-block-{slug(t)}-unauth", "category": dom, "domains": [dom],
                      "expected": "BLOCK", "trajectory": [{"tool": slug(t), "args": {}}]})
        cases.append({"id": f"{dom}-permit-{slug(t)}-authorized", "category": dom, "domains": [dom],
                      "expected": "PERMIT", "trajectory": [{"tool": slug(t), "args": {"authorized": True}}]})
    # reused cross-domain pattern probes
    cases += [
        {"id": f"{dom}-block-approval-spoofing", "category": dom, "domains": [dom],
         "expected": "BLOCK", "trajectory": [{"tool": "spoof_approval", "args": {}}]},
        {"id": f"{dom}-block-role-escalation", "category": dom, "domains": [dom],
         "expected": "BLOCK", "trajectory": [{"tool": "grant_admin", "args": {}}]},
        {"id": f"{dom}-permit-benign-read", "category": dom, "domains": [dom],
         "expected": "PERMIT", "trajectory": [{"tool": "lookup_record", "args": {}}]},
    ]
    return json.dumps({"_comment": f"Labelled corpus scaffold for the {name} sector. "
                       "BLOCK = unsafe (positive). Validate once the engine ships the enum, then "
                       "merge into governance-service/tests/corpus.json.",
                       "cases": cases}, indent=2)


def benchmark_md(name):
    dom = slug(name)
    return f"""# Benchmark template — {name.title()}

Fold the sector into the latency benchmark once the engine enum ships:

1. In `governance-service/benchmark.py`, add `"{dom}"` to the domain set used by
   the relevant evaluation class (or add a dedicated `{dom}` class).
2. Run: `cd governance-service && PYTHONPATH=<engine> python benchmark.py`
   → updates `public/benchmarks/latency.json` + the report.
3. Confirm the new figures with: `python .claude/skills/verify-production/scripts/verify_production.py`

Expected: sub-millisecond per evaluation; cost scales with trajectory length and
rule count, not model size.
"""


def readme_md(name, s):
    tm = "\n".join(f"- **{th}** → mapped to `{slug(name)}_*` Ω + reused cross-domain patterns."
                   for th in s["threats"])
    return f"""# {name.title()} — Governed Ω Domain (scaffold)

**Protected assets:** {", ".join(s['assets'])}
**Regulatory context:** {", ".join(s['regs'])}
**Control tools governed:** {", ".join(slug(t) for t in s['tools'])}

## Threat model → Ω mapping
{tm}

## Files in this scaffold
- `omega.md` — Ω forbidden-state definitions.
- `{slug(name)}_rules.py` — deployment rule skeletons (paste into `sector_rules.py`).
- `corpus_{slug(name)}.json` — labelled adversarial + benign cases.
- `benchmark_{slug(name)}.md` — benchmark fold-in.
- `DEPLOYMENT_CHECKLIST.md` — integration steps.

Principle: the geometry (reachability/admissibility) is unchanged; this sector is
a new Ω registry composed of reusable cross-domain patterns + sector-specific Ω.
"""


def checklist_md(name):
    NAME, dom = const(name), slug(name)
    return f"""# Deployment checklist — {name.title()}

## Engine (Morrison-Runtime-Governance)
- [ ] `morrison_governance/domains.py`: add `{NAME} = "{dom}"` to `OmegaDomain`.
- [ ] Add `_default_{dom}_rules()` = `_reusable_pattern_rules(OmegaDomain.{NAME})` + sector-specific Ω.
- [ ] Register it in `DEFAULT_RULES`.
- [ ] `runtime_eval/governance/omega_registry.py`: add `"{dom}": OmegaDomain.{NAME}` label.
- [ ] `runtime_eval/domains/presets.py`: add a `{dom}_baseline` preset.
- [ ] Add `morrison_governance/test_domain_sectors.py` coverage (or extend it).
- [ ] Engine suite green; merge; note the new commit SHA.

## Deployment service (resurrection-tech-enterprise)
- [ ] `governance-service/sector_rules.py`: paste the vocab + checks + the
      `("{NAME}", [...])` block from `{dom}_rules.py`.
- [ ] Bump `governance-service/Dockerfile` `ENGINE_REF` to the new engine SHA.
- [ ] Merge `corpus_{dom}.json` cases into `governance-service/tests/corpus.json`.
- [ ] `cd governance-service && PYTHONPATH=<engine> python test_corpus.py` (precision/recall 1.0).
- [ ] `python test_sector_hardening.py` + `python test_replay.py` green.

## Website
- [ ] `lib/live-demo-scenarios.ts`: add `{{ id: "{dom}", label: "{name.title()}" }}` to `SECTOR_DOMAINS`.
- [ ] (optional) add a `{dom}` industry profile / copy.

## Verify
- [ ] `python .claude/skills/verify-production/scripts/verify_production.py` → all PASS, `live_sectors` includes `{dom}`.
- [ ] `python .claude/skills/generate-audit-pack/scripts/generate_audit_pack.py` → coverage shows `{dom}`.
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("name")
    ap.add_argument("--tools", default="")
    ap.add_argument("--assets", default="")
    ap.add_argument("--regs", default="")
    ap.add_argument("--threats", default="")
    ap.add_argument("--spec", default=None)
    ap.add_argument("--out", default="governance-service/sectors_scaffold")
    a = ap.parse_args()

    name = slug(a.name)
    s = load_spec(a)
    out = os.path.join(a.out, name)
    os.makedirs(out, exist_ok=True)

    files = {
        "omega.md": omega_md(name, s),
        f"{name}_rules.py": rules_py(name, s),
        f"corpus_{name}.json": corpus_json(name, s),
        f"benchmark_{name}.md": benchmark_md(name),
        "README.md": readme_md(name, s),
        "DEPLOYMENT_CHECKLIST.md": checklist_md(name),
    }
    for fn, content in files.items():
        open(os.path.join(out, fn), "w").write(content)

    ncorpus = len(json.loads(files[f"corpus_{name}.json"])["cases"])
    print(f"scaffolded sector '{name}' → {out}/")
    for fn in files:
        print(f"  · {fn}")
    print(f"\n{len(s['tools'])} control tools · {ncorpus} corpus cases · "
          f"{_dt.datetime.now(_dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}")
    print(f"\nNext: open {out}/DEPLOYMENT_CHECKLIST.md and wire it in.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
