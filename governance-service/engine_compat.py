"""Engine compatibility contract for the governance service.

The service vendors the Morrison engine at the commit pinned in the Dockerfile
(`ENGINE_REF`). On 19 September the service started passing
`SecurityContext(trusted_facts=...)`, which the pinned engine (331db20) did not
have: every governed request then raised `TypeError`, the service answered
HTTP 500, and the gateway turned that into BLOCK. CI never saw it because CI
tested the service against engine `main`, not against the pin.

This module states, as code, every engine interface the service relies on, and
checks it three times:

  * at image BUILD (Dockerfile `RUN python engine_compat.py`): an incompatible
    engine cannot produce an image, so it cannot be deployed;
  * at service BOOT (app lifespan): a mismatched runtime refuses to start
    unless GOVERNANCE_ALLOW_INCOMPATIBLE_ENGINE is set on purpose;
  * at /health: the result is published with the engine commit, so an
    operator can verify the deployed engine without trusting the build log.
"""

from __future__ import annotations

import dataclasses
import inspect
import json
import sys
from typing import Callable

# Bump when the service starts relying on a new engine interface.
SERVICE_ENGINE_CONTRACT = 2


def _context_fields() -> set:
    from morrison_governance.kernel import SecurityContext
    return {f.name for f in dataclasses.fields(SecurityContext)}


def _params(fn) -> set:
    return set(inspect.signature(fn).parameters)


def _checks() -> list[tuple[str, Callable[[], bool]]]:
    def kernel():
        from morrison_governance.kernel import GovernanceKernel
        return GovernanceKernel

    def decision():
        from morrison_governance.kernel.gate import Decision
        return Decision

    return [
        ("SecurityContext.trusted_facts (gateway-established policy facts)",
         lambda: "trusted_facts" in _context_fields()),
        ("SecurityContext.continuity_store (durable trajectory/approval state)",
         lambda: "continuity_store" in _context_fields()),
        ("SecurityContext.approvals",
         lambda: "approvals" in _context_fields()),
        ("GovernanceKernel(evidence_key=, engine_version=, require_evidence_key=)",
         lambda: {"evidence_key", "engine_version", "require_evidence_key"}
         <= _params(kernel().__init__)),
        ("GovernanceKernel.authorize(argument_provenance=)",
         lambda: "argument_provenance" in _params(kernel().authorize)),
        ("GovernanceKernel.record_remote_execution",
         lambda: callable(getattr(kernel(), "record_remote_execution", None))),
        ("Decision.admissibility (local/global/strictest verdicts)",
         lambda: callable(getattr(decision(), "admissibility", None))),
        ("GovernanceKernel.integrity(expected_head, expected_count)",
         lambda: {"expected_head", "expected_count"}
         <= _params(kernel().integrity)),
        ("EvidenceChain.anchor / verify(expected_head=, expected_count=)",
         lambda: _evidence_chain_ok()),
        ("attestation.recompute_chain(key=, expected_head=, expected_count=)",
         lambda: _recompute_ok()),
        ("continuity.FileContinuityStore (durable across restart)",
         lambda: _file_store_ok()),
        ("runtime_eval.frontier.boundary.run_boundary_scenarios",
         lambda: _boundary_ok()),
    ]


def _evidence_chain_ok() -> bool:
    from morrison_governance.kernel.evidence import EvidenceChain
    return (callable(getattr(EvidenceChain, "anchor", None))
            and {"expected_head", "expected_count"} <= _params(EvidenceChain.verify))


def _recompute_ok() -> bool:
    from morrison_governance.kernel.attestation import recompute_chain
    return {"key", "expected_head", "expected_count"} <= _params(recompute_chain)


def _file_store_ok() -> bool:
    from morrison_governance.kernel.continuity import FileContinuityStore
    return callable(FileContinuityStore)


def _boundary_ok() -> bool:
    from runtime_eval.frontier.boundary import run_boundary_scenarios
    return callable(run_boundary_scenarios)


def check_engine() -> dict:
    """Evaluate every requirement. Never raises."""
    results = []
    for name, probe in _checks():
        try:
            ok = bool(probe())
            error = None
        except Exception as exc:  # noqa: BLE001 — a missing module is a failed requirement
            ok, error = False, f"{type(exc).__name__}: {exc}"
        results.append({"requirement": name, "ok": ok, "error": error})
    missing = [r["requirement"] for r in results if not r["ok"]]
    return {
        "service_engine_contract": SERVICE_ENGINE_CONTRACT,
        "compatible": not missing,
        "missing": missing,
        "requirements": results,
    }


class IncompatibleEngineError(RuntimeError):
    pass


def assert_compatible() -> dict:
    report = check_engine()
    if not report["compatible"]:
        raise IncompatibleEngineError(
            "the vendored Morrison engine does not provide interfaces this "
            "service calls: " + "; ".join(report["missing"]))
    return report


if __name__ == "__main__":  # Dockerfile build gate
    result = check_engine()
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["compatible"] else 1)
