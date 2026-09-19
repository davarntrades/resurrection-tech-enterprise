#!/usr/bin/env python3
"""Produce verification artifacts under THIS deployment's ruleset.

A verification artifact only describes a deployment if the verifier ran against
that deployment's governance configuration. The verifier's own default kernel
does not: it loads its own domain set, so its ruleset hash differs and the
audit pack rightly refuses to carry the claim.

This builds a kernel factory from the deployment's layer -- the same
`_layer(domains, horizon)` the service and `verify-production` use -- runs the
declared models through it, and writes artifacts whose `ruleset_hash` is the
deployment's. Nothing about the models, the assumptions or the verdicts is
altered; only the governance the models are enumerated against.

  python verify_against_deployment.py --out DIR [--engine PATH] [--escalations ...]
"""
from __future__ import annotations

import argparse
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "..", "verify-production", "scripts"))
import verify_production as vp  # noqa: E402


def deployment_kernel_factory(domains, horizon):
    """A kernel carrying the deployment's rules, not the verifier's defaults."""
    from replay import _layer  # type: ignore
    from morrison_governance.kernel import GovernanceKernel, Principal, SecurityContext
    from morrison_governance.kernel.continuity import InMemoryContinuityStore
    from morrison_governance.global_verification.governance import DEFAULT_TOOL_MANIFEST

    def factory():
        return GovernanceKernel(
            layer=_layer(list(domains), horizon),
            context=SecurityContext(
                principal=Principal(id="deployment-bound-verifier", tenant="modeled-tenant"),
                signing_key=b"global-verification-no-approvals",
                trusted_issuers=frozenset({"modeled-authority"}),
                internal_url_hosts=("internal.modeled", "localhost"),
                internal_email_domains=("modeled.internal",),
                tool_manifest=dict(DEFAULT_TOOL_MANIFEST),
                unknown_tool_policy="escalate",
                continuity_store=InMemoryContinuityStore(),
            ),
            evidence_key=b"global-verification-evidence",
            engine_version="deployment-bound-verification",
        )
    return factory


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", required=True)
    ap.add_argument("--engine", default=None)
    ap.add_argument("--escalations", default="deny",
                    choices=("deny", "deny-and-approve", "approve"))
    ap.add_argument("--horizon", type=int, default=3)
    a = ap.parse_args(argv)

    root = vp.repo_root()
    engine = vp.resolve_engine(root, a.engine)
    if engine is None:
        print("ERROR: the Morrison engine is not importable", file=sys.stderr)
        return 2

    bench_path = os.path.join(root, "public/benchmarks/latency.json")
    bench = json.load(open(bench_path)) if os.path.isfile(bench_path) else {}
    domains = bench.get("config", {}).get("domains", ["finance"])

    from morrison_governance.global_verification.ci_gate import (  # type: ignore
        EXPECTATIONS, _environment, _POLICIES, _slug,
    )
    from morrison_governance.global_verification.comparison import (  # type: ignore
        compare_control_and_governed,
    )
    from morrison_governance.global_verification.evidence import (  # type: ignore
        build_verification_artifact,
    )
    from morrison_governance.global_verification.governance import (  # type: ignore
        MorrisonKernelAdapter,
    )
    from morrison_governance.global_verification.provenance import (  # type: ignore
        VerificationEvidenceLedger, validate_verification_artifact,
    )
    from morrison_governance.global_verification.verifier import VerificationLimits  # type: ignore

    factory = deployment_kernel_factory(domains, a.horizon)
    probe = MorrisonKernelAdapter(factory)
    print(f"deployment domains : {domains}")
    print(f"deployment ruleset : {probe.configuration_hash}")

    os.makedirs(a.out, exist_ok=True)
    declared = json.loads(open(EXPECTATIONS).read())
    cases = [c for c in declared["expectations"] + declared["perturbation_expectations"]
             if c["escalations"] == a.escalations]
    limits = VerificationLimits(timeout_seconds=120.0)
    written = 0
    for case in cases:
        environment = _environment(case["model"])
        ledger = VerificationEvidenceLedger()
        governance = MorrisonKernelAdapter(factory, ledger=ledger)
        comparison = compare_control_and_governed(
            environment, governance, limits=limits,
            escalation_policy=_POLICIES[case["escalations"]])
        artifact = build_verification_artifact(
            environment, governance, comparison,
            algorithm="bfs", limits=limits, ledger=ledger)
        validation = validate_verification_artifact(artifact)
        path = os.path.join(a.out, f"{_slug(case['model'], case['escalations'])}.json")
        open(path, "w").write(json.dumps(artifact, indent=2, sort_keys=True) + "\n")
        written += 1
        print(f"  {case['model']:38s} {artifact['finite_verification']['verdict']:28s} "
              f"valid={validation.valid}")
    print(f"\nwrote {written} artifact(s) to {a.out}")
    print("NOTE: verdicts are enumerated against the DEPLOYMENT ruleset and may "
          "differ from the repository's declared expectations, which are stated "
          "for the verifier's own configuration.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
