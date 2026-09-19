"""Finite-model verification evidence for the audit pack.

An audit pack carries EMPIRICAL evidence: measured latency, a labelled corpus,
replay determinism, a hash-chained trail. Those say what the engine did on the
cases it was given. A finite-model verification says something different in
kind -- that inside a declared model, under stated assumptions, no prohibited
state was reachable. The two must not be blended, and this module exists to
keep them apart while letting one pack carry both.

Rules it enforces, all fail-closed:

- A pack that makes NO finite-verification claim is valid. Absence is normal
  and is stated, not implied.
- A pack that DOES make the claim must carry the artifact, and that artifact
  must validate with the verifier's own validator. A tampered, incomplete or
  mismatched artifact fails the pack rather than being footnoted.
- SAFE_WITHIN_MODEL is never restated as "production safe". The scope travels
  with the verdict everywhere it appears.
"""

from __future__ import annotations

import hashlib
import json
import os
from typing import Any


SECTION_SCHEMA = "morrison-evidence-manifest.finite-verification/1"

# Rendered wherever a finite-model verdict is shown, so the scope cannot be
# separated from the claim by skim-reading.
SCOPE_NOTE = (
    "A finite-model result holds **within its declared model and stated "
    "assumptions only**. It is not a statement about the production "
    "environment, and it is not a claim of universal or open-world safety."
)

CLASS_NOTE = (
    "This pack carries four distinct classes of evidence. They are not "
    "interchangeable and are never combined into a single figure:\n\n"
    "| Class | What it establishes | What it cannot establish |\n"
    "|---|---|---|\n"
    "| Formal (finite-model) | No prohibited state is reachable inside a "
    "declared finite model, under stated assumptions | Anything outside that "
    "model, including this deployment |\n"
    "| Empirical (runtime) | What the engine decided on measured cases — "
    "corpus, latency, replay | That unmeasured cases behave the same way |\n"
    "| Pilot (operational) | What happened in a declared bounded deployment | "
    "That other environments behave the same way |\n"
    "| Attestation | That a deployment is running the engine and ruleset it "
    "claims | That the engine is correct |\n"
)


class FiniteVerificationError(RuntimeError):
    """The pack claims a bounded verification it cannot support."""


def _sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def load_artifacts(path: str) -> list[tuple[str, bytes, dict[str, Any]]]:
    """Load one artifact file, or every artifact in a directory.

    A CI run emits a directory plus a summary; the summary is not an artifact
    and is skipped rather than parsed as one.
    """
    if os.path.isdir(path):
        names = sorted(
            n for n in os.listdir(path)
            if n.endswith(".json") and not n.startswith("verification-summary")
        )
        paths = [os.path.join(path, n) for n in names]
    else:
        paths = [path]
    out = []
    for p in paths:
        raw = open(p, "rb").read()
        try:
            doc = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise FiniteVerificationError(f"{p}: not valid JSON ({exc})") from exc
        out.append((p, raw, doc))
    if not out:
        raise FiniteVerificationError(f"no verification artifacts found at {path}")
    return out


def _validator():
    """The verifier's own validator, or None when the engine is unreachable."""
    try:
        from morrison_governance.global_verification.provenance import (  # type: ignore
            validate_verification_artifact,
        )
        return validate_verification_artifact
    except Exception:  # noqa: BLE001
        return None


def check_artifact(
    path: str, raw: bytes, doc: dict[str, Any], *, deployment_ruleset_hash: str | None
) -> dict[str, Any]:
    """Validate one artifact and bind it to this deployment's ruleset."""
    name = os.path.basename(path)
    failures: list[str] = []

    validate = _validator()
    if validate is None:
        # Without the engine there is no validator, and an unvalidated artifact
        # is not evidence. Degrade to a refusal, never to a pass.
        raise FiniteVerificationError(
            "the Morrison engine is not importable, so verification artifacts "
            "cannot be validated; refusing to carry an unvalidated claim"
        )
    result = validate(doc)
    if not result.valid:
        failures.append(
            "artifact failed validation: "
            + ", ".join(f["check"] for f in result.failures())
        )

    fv = doc.get("finite_verification") or {}
    verdict = fv.get("verdict")
    complete = fv.get("complete_enumeration")
    if verdict == "SAFE_WITHIN_MODEL" and complete is not True:
        failures.append("SAFE_WITHIN_MODEL on an incomplete enumeration")
    if verdict == "INCONCLUSIVE":
        # Carried, but never counted as proof of anything.
        pass

    governance = doc.get("governance") or {}
    artifact_ruleset = governance.get("ruleset_hash")
    # Compare LIKE WITH LIKE. A deployment publishes the logic-binding hash over
    # its rules; the kernel's integrity hash binds more than that, so the two
    # can never agree. Comparing them would look like drift detection while
    # being incapable of ever passing.
    artifact_rules_logic = governance.get("rules_logic_hash")
    ruleset_matches = None
    if deployment_ruleset_hash:
        if not artifact_rules_logic:
            failures.append(
                "the artifact predates rules_logic_hash, so it cannot be "
                "compared with this deployment's published ruleset"
            )
        else:
            ruleset_matches = artifact_rules_logic == deployment_ruleset_hash
            if not ruleset_matches:
                failures.append(
                    f"ruleset mismatch: the artifact was enumerated against "
                    f"{artifact_rules_logic[:16]}… but this deployment "
                    f"publishes {deployment_ruleset_hash[:16]}…"
                )

    verifier = doc.get("verifier") or {}
    if not verifier.get("repository_commit"):
        failures.append("the artifact records no repository commit")

    return {
        "artifact_file": name,
        "verification_id": doc.get("verification_id"),
        "schema_version": doc.get("schema_version"),
        "model": {
            "name": (doc.get("environment") or {}).get("name"),
            "version": (doc.get("environment") or {}).get("version"),
            "model_hash": (doc.get("environment") or {}).get("model_hash"),
            "transition_relation_id":
                (doc.get("environment") or {}).get("transition_relation_id"),
        },
        "ruleset_hash": artifact_ruleset,
        "rules_logic_hash": artifact_rules_logic,
        "engine_version": (doc.get("governance") or {}).get("engine_version"),
        "repository_commit": verifier.get("repository_commit"),
        "verifier_version": verifier.get("verifier_version"),
        "verdict": verdict,
        "complete_enumeration": complete,
        "escalation_outcomes_admitted":
            (doc.get("traversal") or {}).get("escalation_outcomes_admitted") or [],
        "assumptions": doc.get("assumptions") or [],
        "limitations": doc.get("limitations") or [],
        "artifact_hash": (doc.get("artifact_integrity") or {}).get("artifact_hash"),
        "artifact_bytes_sha256": _sha256_bytes(raw),
        "matches_deployment_ruleset": ruleset_matches,
        "validation": {
            "valid": result.valid,
            "checks": len(result.checks),
            "failed": [f["check"] for f in result.failures()],
        },
        "evidence_records": (doc.get("evidence_ledger") or {}).get("record_count", 0),
        "passed": not failures,
        "failures": failures,
    }


def build_section(
    path: str | None, *, deployment_ruleset_hash: str | None
) -> dict[str, Any] | None:
    """The manifest block, or None when the pack makes no such claim."""
    if not path:
        return None
    entries = [
        check_artifact(p, raw, doc, deployment_ruleset_hash=deployment_ruleset_hash)
        for p, raw, doc in load_artifacts(path)
    ]
    failed = [e for e in entries if not e["passed"]]
    if failed:
        detail = "; ".join(
            f"{e['artifact_file']}: {'; '.join(e['failures'])}" for e in failed
        )
        raise FiniteVerificationError(
            f"refusing to issue an audit pack claiming finite verification — {detail}"
        )
    return {
        "schema": SECTION_SCHEMA,
        "claimed": True,
        "scope": SCOPE_NOTE,
        "artifact_count": len(entries),
        "verdicts": {
            v: sum(1 for e in entries if e["verdict"] == v)
            for v in sorted({e["verdict"] for e in entries if e["verdict"]})
        },
        "artifacts": entries,
    }


def markdown(section: dict[str, Any] | None) -> list[str]:
    """The human-readable section. Absence is stated, not implied."""
    L: list[str] = ["## Finite-model verification", ""]
    if section is None:
        L += [
            "**This pack makes no finite-model verification claim.**",
            "",
            "No verification artifact was supplied, so nothing in this document "
            "asserts that a prohibited state is unreachable in any model. The "
            "evidence below is empirical: it reports what the engine decided on "
            "measured cases.",
            "",
        ]
        return L

    L += [SCOPE_NOTE, ""]
    verdicts = ", ".join(f"{v} × {n}" for v, n in section["verdicts"].items())
    L += [
        f"{section['artifact_count']} artifact(s) carried; verdicts: {verdicts}.",
        "",
        "| Model | Verdict | Complete | Escalations | Verification ID | Commit |",
        "|---|---|---|---|---|---|",
    ]
    for e in section["artifacts"]:
        L.append(
            f"| `{e['model']['name']}` v{e['model']['version']} | **{e['verdict']}** | "
            f"{e['complete_enumeration']} | "
            f"{', '.join(e['escalation_outcomes_admitted']) or '—'} | "
            f"`{e['verification_id']}` | `{str(e['repository_commit'])[:12]}` |"
        )
    L += ["", "### Provenance", ""]
    for e in section["artifacts"]:
        L += [
            f"**`{e['model']['name']}`** — {e['artifact_file']}",
            "",
            f"- model hash `{e['model']['model_hash']}`",
            f"- transition relation `{e['model']['transition_relation_id']}`",
            f"- rules (logic-binding) `{e['rules_logic_hash']}` "
            + ("(matches this deployment)" if e["matches_deployment_ruleset"]
               else "(deployment ruleset not compared)"
               if e["matches_deployment_ruleset"] is None else "(MISMATCH)"),
            f"- verifier `{e['verifier_version']}` at commit `{e['repository_commit']}`",
            f"- artifact hash `{e['artifact_hash']}`",
            f"- artifact bytes sha256 `{e['artifact_bytes_sha256']}`",
            f"- validation: {e['validation']['checks']} checks, "
            f"{'all passed' if e['validation']['valid'] else 'FAILED'}",
            f"- retained kernel evidence records: {e['evidence_records']}",
            "",
        ]
    seen: set[str] = set()
    L += ["### Assumptions", ""]
    for e in section["artifacts"]:
        for a in e["assumptions"]:
            if a not in seen:
                seen.add(a)
                L.append(f"- {a}")
    L += ["", "### Limitations", ""]
    seen = set()
    for e in section["artifacts"]:
        for a in e["limitations"]:
            if a not in seen:
                seen.add(a)
                L.append(f"- {a}")
    L += ["", "### How to re-check this independently", "",
          "1. Check out the recorded commit in the engine repository.",
          "2. Run `python -m morrison_governance.global_verification.ci_gate "
          "--out DIR`, which re-enumerates every declared model.",
          "3. Compare the resulting `verification_id`, `model_hash` and verdict "
          "with the table above.",
          "",
          "Re-running the enumeration is the only way to confirm it happened. "
          "Validating the artifact confirms the document is internally "
          "consistent; it does not confirm the work behind it.",
          ""]
    return L
