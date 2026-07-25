"""
Guardian OS Sovereign — in-container air-gap assertions.

Run INSIDE the sovereign engine image, in a container started with
`--network none`. This is the check that turns "air-gapped" from a claim into a
CI result, so it lives in a file rather than inline in the workflow: multi-line
Python nested inside YAML inside a `docker run` is exactly the kind of quoting
that breaks silently, and a governance proof that silently stops running is
worse than no proof at all. (It did break once — the workflow failed to parse
and therefore never ran a single job.)

    docker run --rm --network none -e GUARDIAN_PROFILE=air_gapped \
      -v "$PWD/scripts/sovereign:/checks:ro" IMAGE python /checks/airgap_engine_check.py

    ... same, with --expect-tampered against an image built from a tampered bundle

Exit 0 on success, 1 with a reason on failure.
"""

from __future__ import annotations

import json
import sys

import dynamic_rules as dr


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def load_then_status():
    """Rules FIRST, then status.

    `policy_bundle.status()` reports the last load's result, and before any load
    that result is empty — so reading status first yields ok=false with no
    errors. Getting this backwards made the tampered-bundle check pass
    VACUOUSLY: it asserted ok=false, which an unloaded bundle satisfies
    trivially. Loading first is what makes both branches mean anything.
    """
    rules = dr.active_rules()
    return rules, dr.status()


def check_good() -> None:
    rules, st = load_then_status()
    print(json.dumps(st, indent=1))

    if st.get("provider") != "bundle":
        fail(f"engine did not use the baked policy bundle (provider={st.get('provider')!r})")
    b = st.get("bundle") or {}
    if not b.get("ok"):
        fail(f"the baked policy bundle failed verification: {b.get('errors')}")
    if not b.get("signed") or b.get("alg") != "ed25519":
        fail(f"bundle signature was not verified (signed={b.get('signed')} alg={b.get('alg')!r})")

    if len(rules) != 1:
        fail(f"expected 1 bundled rule, got {len(rules)}")
    r = rules[0]

    # The whole point: the policy that travelled on media actually enforces.
    if r.check({"tool": "wire_transfer", "amount": 25000}) is not True:
        fail("the bundled policy did not BLOCK a violating action")
    if r.check({"tool": "wire_transfer", "amount": 100}) is not False:
        fail("the bundled policy over-blocked a compliant action")
    if r.check({"tool": "send_email"}) is not False:
        fail("the bundled policy reached an unrelated tool")

    print("air-gapped engine governs with no network: OK")


def check_tampered() -> None:
    rules, st = load_then_status()
    b = st.get("bundle") or {}
    if b.get("ok"):
        fail("a tampered bundle was ACCEPTED")
    if rules != []:
        fail(f"a tampered bundle still yielded {len(rules)} rule(s) — NOT fail-closed")
    # A rejection with no recorded reason means the bundle was never actually
    # read, which would make this assertion pass vacuously.
    errors = b.get("errors") or []
    if not errors:
        fail("the bundle was rejected but recorded NO reason — it was probably never loaded")
    print(f"tampered bundle rejected, zero rules loaded: {errors[0]}")


if __name__ == "__main__":
    if "--expect-tampered" in sys.argv:
        check_tampered()
    else:
        check_good()
