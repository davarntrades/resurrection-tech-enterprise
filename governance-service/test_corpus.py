"""
Labelled-corpus regression gate for the deployed governance configuration.

Builds the exact layer the service builds (selected domains + finance + coverage
custom rules) and evaluates every labelled case. BLOCK is the positive class
(detecting unsafe). Prints a confusion matrix + precision/recall/accuracy and
exits non-zero on ANY mismatch, so CI fails the deploy on a regression.

Run directly:   PYTHONPATH=/path/to/engine python test_corpus.py
Or via pytest:  PYTHONPATH=/path/to/engine pytest test_corpus.py
"""

from __future__ import annotations

import json
import os
import sys

from morrison_governance import GovernanceLayer, OmegaDomain
from finance_rules import finance_custom_rules
from coverage_rules import coverage_custom_rules
from domain_rules import domain_custom_rules
from sector_rules import sector_custom_rules

HERE = os.path.dirname(os.path.abspath(__file__))
CORPUS = os.path.join(HERE, "tests", "corpus.json")
CUSTOM = (finance_custom_rules() + coverage_custom_rules()
          + domain_custom_rules() + sector_custom_rules())
_LAYERS: dict[tuple, GovernanceLayer] = {}


def _domains_supported(domains: list[str]) -> bool:
    """A corpus case is only evaluable if all its domains exist in the running
    engine. Target-sector cases are skipped on engines that predate the sector
    enum values, so the gate stays green until the engine ships them and then
    validates them automatically."""
    for d in domains:
        try:
            OmegaDomain(d)
        except ValueError:
            return False
    return True


def _layer(domains: list[str]) -> GovernanceLayer:
    key = tuple(domains)
    if key not in _LAYERS:
        _LAYERS[key] = GovernanceLayer(
            domains=[OmegaDomain(d) for d in domains], horizon=3, log_all=False,
            custom_rules=CUSTOM,
        )
    return _LAYERS[key]


def _verdict(case: dict) -> tuple[str, str, str]:
    r = _layer(case["domains"]).evaluate_plan(case["trajectory"])
    label = "BLOCK" if r.blocked else "PERMIT"  # NO_VALID_SOLUTION / ENV_SENSITIVE → BLOCK
    rule = (r.metadata or {}).get("rule", "-")
    return label, r.layer, rule


def load_cases() -> list[dict]:
    with open(CORPUS) as fh:
        return json.load(fh)["cases"]


def evaluate() -> dict:
    cases = load_cases()
    tp = fp = tn = fn = 0
    skipped = 0
    mismatches = []
    for c in cases:
        if not _domains_supported(c["domains"]):
            skipped += 1  # sector not in this engine yet — validated once it ships
            continue
        exp = c["expected"]
        got, layer, rule = _verdict(c)
        ok = got == exp
        if exp == "BLOCK" and got == "BLOCK":
            tp += 1
        elif exp == "PERMIT" and got == "PERMIT":
            tn += 1
        elif exp == "PERMIT" and got == "BLOCK":
            fp += 1
        elif exp == "BLOCK" and got == "PERMIT":
            fn += 1
        if not ok:
            mismatches.append((c["id"], c["category"], exp, got, layer, rule))
    evaluated = len(cases) - skipped
    precision = tp / (tp + fp) if (tp + fp) else 1.0
    recall = tp / (tp + fn) if (tp + fn) else 1.0
    accuracy = (tp + tn) / evaluated if evaluated else 1.0
    return {
        "total": len(cases), "evaluated": evaluated, "skipped": skipped,
        "tp": tp, "fp": fp, "tn": tn, "fn": fn,
        "precision": precision, "recall": recall, "accuracy": accuracy,
        "mismatches": mismatches,
    }


def _report(m: dict) -> str:
    lines = [
        f"corpus cases      : {m['total']} (evaluated {m['evaluated']}, skipped {m['skipped']} — sector pending engine)",
        f"confusion (BLOCK+): TP={m['tp']} FP={m['fp']} TN={m['tn']} FN={m['fn']}",
        f"precision         : {m['precision']:.4f}",
        f"recall            : {m['recall']:.4f}",
        f"accuracy          : {m['accuracy']:.4f}",
    ]
    if m["mismatches"]:
        lines.append(f"MISMATCHES ({len(m['mismatches'])}):")
        for mid, cat, exp, got, layer, rule in m["mismatches"]:
            lines.append(f"  ✗ {mid} [{cat}] expected={exp} got={got} layer={layer} rule={rule}")
    else:
        lines.append("MISMATCHES        : none ✓")
    return "\n".join(lines)


# ── pytest entry point ──
def test_corpus_no_regressions():
    m = evaluate()
    assert not m["mismatches"], "\n" + _report(m)
    assert m["precision"] == 1.0 and m["recall"] == 1.0


if __name__ == "__main__":
    m = evaluate()
    print(_report(m))
    sys.exit(1 if m["mismatches"] else 0)
