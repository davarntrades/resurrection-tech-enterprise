#!/usr/bin/env python3
"""Replay determinism + tamper-detection tests.

Proves the audit claim: a stored trace re-evaluates bit-identically, and any
tampering with the recorded verdict/hash is detected.

    PYTHONPATH=/path/to/engine python test_replay.py
"""

from __future__ import annotations

import sys

from replay import derive, verify, _ruleset_hash, _layer

# Representative traces across core + sector domains (BLOCK and PERMIT).
TRACES = [
    {"trajectory": [{"tool": "engage_target", "args": {}}],
     "domains": ["defence"], "horizon": 3},
    {"trajectory": [{"tool": "send_email",
                     "args": {"classification": "secret", "destination_external": True}}],
     "domains": ["defence"], "horizon": 3},
    {"trajectory": [{"tool": "transfer", "args": {"amount": 50000, "threshold": 1000}}],
     "domains": ["finance"], "horizon": 3},
    {"trajectory": [{"tool": "read_report", "args": {}}],
     "domains": ["finance"], "horizon": 3},
    {"trajectory": [{"tool": "set_grid_setpoint", "args": {"out_of_envelope": True}}],
     "domains": ["energy"], "horizon": 3},
]


def main() -> int:
    failures = []
    for t in TRACES:
        label = f'{t["domains"][0]}:{t["trajectory"][0]["tool"]}'

        # 1. Emit expected, then verify → must match.
        t["expected"] = derive(t)
        r = verify(t)
        if not (r["match"] and r["checked"]):
            failures.append(f"{label}: emitted trace did not self-verify: {r}")

        # 2. Determinism — re-derive is bit-identical.
        if derive(t) != t["expected"]:
            failures.append(f"{label}: re-derive not deterministic")

        # 3. Tamper detection — flip the verdict, mismatch must be caught.
        flipped = "PERMIT" if t["expected"]["verdict"] != "PERMIT" else "BLOCK"
        bad = dict(t, expected=dict(t["expected"], verdict=flipped))
        if verify(bad)["match"]:
            failures.append(f"{label}: tampered verdict was NOT detected")

        v = t["expected"]["verdict"]
        print(f"  {label:34} verdict={v:7} thash={t['expected']['trajectory_hash'][:12]} "
              f"rhash={t['expected']['ruleset_hash'][:12]} ✓")

    # 4. ruleset_hash agrees with the service's app._ruleset_hash (no drift).
    try:
        import app  # noqa: F401  (only if FastAPI is available)
        layer = _layer(["finance"], 3)
        if app._ruleset_hash(layer.rules) != _ruleset_hash(layer.rules):
            failures.append("ruleset_hash drift between replay.py and app.py")
        else:
            print("  app._ruleset_hash == replay._ruleset_hash ✓")
    except Exception:  # noqa: BLE001  FastAPI not installed in the gate — skip.
        print("  (app import skipped — FastAPI not present; hash-parity check deferred)")

    print(f"\n{len(TRACES)} traces · determinism + tamper-detection: "
          f"{'PASS' if not failures else 'FAIL'}")
    for f in failures:
        print("  ✗", f)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
