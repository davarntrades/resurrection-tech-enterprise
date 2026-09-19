#!/usr/bin/env python3
"""Tests for finite-model verification evidence in the audit pack.

  python test_finite_verification.py --artifacts DIR --engine PATH
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
sys.path.insert(0, os.path.join(_HERE, "..", "..", "verify-production", "scripts"))
import verify_production as vp  # noqa: E402
import finite_verification as fv  # noqa: E402

PASS = FAIL = 0
FAILURES: list[str] = []


def ok(cond, msg):
    global PASS, FAIL
    if cond:
        PASS += 1
    else:
        FAIL += 1
        FAILURES.append(msg)


def raises(fn, fragment, msg):
    try:
        fn()
    except fv.FiniteVerificationError as exc:
        ok(fragment in str(exc), f"{msg} — wrong reason: {exc}")
    except Exception as exc:  # noqa: BLE001
        ok(False, f"{msg} — unexpected {type(exc).__name__}: {exc}")
    else:
        ok(False, f"{msg} — no error raised")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifacts", required=True)
    ap.add_argument("--engine", default=None)
    a = ap.parse_args()

    root = vp.repo_root()
    vp.resolve_engine(root, a.engine)

    loaded = fv.load_artifacts(a.artifacts)
    ok(len(loaded) >= 1, "at least one artifact loads")
    path, raw, doc = loaded[0]
    deployment = (doc.get("governance") or {}).get("rules_logic_hash")
    ok(bool(deployment), "artifacts carry rules_logic_hash for deployment comparison")

    # 1 — a pack that makes no claim is valid, and says so.
    ok(fv.build_section(None, deployment_ruleset_hash=deployment) is None,
       "no path means no finite-verification claim")
    md = "\n".join(fv.markdown(None))
    ok("makes no finite-model verification claim" in md,
       "absence of a claim is stated, not implied")

    # 2 — a valid artifact is carried with every required field.
    section = fv.build_section(a.artifacts, deployment_ruleset_hash=deployment)
    ok(section is not None and section["claimed"] is True, "claim is carried")
    required = ("verification_id", "artifact_hash", "model", "ruleset_hash",
                "rules_logic_hash", "repository_commit", "verdict",
                "complete_enumeration", "assumptions", "limitations",
                "artifact_bytes_sha256", "validation", "evidence_records")
    for entry in section["artifacts"]:
        for key in required:
            ok(key in entry and entry[key] not in (None, ""),
               f"{entry['artifact_file']}: required field {key} present")
        ok(entry["model"]["model_hash"], "model hash present")
        ok(entry["validation"]["valid"] is True, "artifact validates")

    # 3 — scope travels with the verdict; no silent promotion.
    rendered = "\n".join(fv.markdown(section)).lower()
    ok("within its declared model and stated assumptions only" in rendered,
       "scope note rendered")
    for phrase in ("production safe", "globally safe", "universally safe",
                   "provably safe in production"):
        ok(phrase not in rendered, f"SAFE_WITHIN_MODEL not restated as '{phrase}'")
    ok("formal (finite-model)" in fv.CLASS_NOTE.lower()
       and "empirical (runtime)" in fv.CLASS_NOTE.lower()
       and "pilot (operational)" in fv.CLASS_NOTE.lower()
       and "attestation" in fv.CLASS_NOTE.lower(),
       "four evidence classes are distinguished")

    # 4 — tampered artifact is rejected.
    tdir = os.path.join(os.path.dirname(a.artifacts.rstrip("/")), "_tamper")
    os.makedirs(tdir, exist_ok=True)
    tampered = copy.deepcopy(doc)
    tampered["evidence_ledger"]["records"][0]["record"]["reason"] = "edited after the fact"
    tpath = os.path.join(tdir, "tampered.json")
    open(tpath, "w").write(json.dumps(tampered, indent=2, sort_keys=True))
    raises(lambda: fv.build_section(tpath, deployment_ruleset_hash=deployment),
           "failed validation", "a tampered artifact is rejected")

    # 5 — ruleset mismatch is rejected.
    raises(lambda: fv.build_section(path, deployment_ruleset_hash="0" * 64),
           "ruleset mismatch", "a ruleset mismatch is rejected")

    # 6 — model hash mismatch surfaces through validation.
    mdir = os.path.join(tdir, "model")
    os.makedirs(mdir, exist_ok=True)
    swapped = copy.deepcopy(doc)
    swapped["environment"]["model_hash"] = "0" * 64
    mpath = os.path.join(mdir, "swapped.json")
    open(mpath, "w").write(json.dumps(swapped, indent=2, sort_keys=True))
    raises(lambda: fv.build_section(mpath, deployment_ruleset_hash=deployment),
           "failed validation", "a swapped model hash is rejected")

    # 7 — an incomplete enumeration is never carried as proof.
    idir = os.path.join(tdir, "incomplete")
    os.makedirs(idir, exist_ok=True)
    incomplete = copy.deepcopy(doc)
    incomplete["finite_verification"]["verdict"] = "SAFE_WITHIN_MODEL"
    incomplete["finite_verification"]["complete_enumeration"] = False
    ipath = os.path.join(idir, "incomplete.json")
    open(ipath, "w").write(json.dumps(incomplete, indent=2, sort_keys=True))
    raises(lambda: fv.build_section(ipath, deployment_ruleset_hash=deployment),
           "failed validation", "SAFE on an incomplete enumeration is rejected")

    # 8 — an honest UNSAFE verdict is carried, not suppressed.
    unsafe = [e for e in section["artifacts"]
              if e["verdict"] == "UNSAFE_COUNTEREXAMPLE_FOUND"]
    ok(bool(unsafe), "an UNSAFE verdict is carried rather than filtered out")
    ok("UNSAFE_COUNTEREXAMPLE_FOUND" in section["verdicts"],
       "UNSAFE verdicts are counted in the summary")

    print(f"\n{PASS} passed, {FAIL} failed")
    for f in FAILURES:
        print("  FAIL " + f)
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
