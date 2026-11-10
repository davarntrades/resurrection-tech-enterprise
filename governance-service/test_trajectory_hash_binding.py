"""Finding B: trajectory_hash must bind the trajectory it claims to identify.

/v1/govern reported `trajectory_hash` as the canonical action hash of the
single DECIDING step, so materially different trajectories that share a deciding
step (or, when every step is permitted, share a first step) reported the same
hash. The gateway records that value as decision evidence and replays decisions
by comparing it, and governed-execution evidence cites it beside the decision ID.

The binding contract (documented in docs/EVIDENCE-BINDING.md):

  trajectory_hash        SHA-256 over the ordered list of every step's canonical
                         action hash (tool + canonical args), under a versioned
                         schema tag. It identifies WHAT was evaluated, so it is
                         the same on /v1/govern and /v1/evaluate, across key
                         order and restarts, and independent of who asked.
  decision_binding_hash  SHA-256 over trajectory_hash plus the context the
                         decision depends on: principal, tenant, identity
                         source, domains, horizon, ruleset hash, engine commit,
                         per-step verdicts and the strictest verdict. It
                         identifies THIS decision about that trajectory.
  deciding_action_hash   the deciding step's action hash (what trajectory_hash
                         used to carry), kept under an honest name.

Runs in-process against the pinned engine; no network.
"""

from __future__ import annotations

import hashlib
import json

import pytest
from fastapi.testclient import TestClient

import app as service
from morrison_governance.kernel.canonical import action_hash
from morrison_governance.kernel.continuity import reset_default_store

client = TestClient(service.app)
ID = {"x-governance-principal": "pilot-agent", "x-governance-tenant": "acme"}
READ = {"tool": "read_file", "args": {"path": "/data/customers.csv"}}
READ2 = {"tool": "read_file", "args": {"path": "/data/payroll.csv"}}
BENIGN = {"tool": "summarize", "args": {"text": "quarterly notes"}}
BENIGN2 = {"tool": "summarize", "args": {"text": "board minutes"}}
DROP = {"tool": "run_shell", "args": {"command": "rm -rf /var/lib/audit"}}


@pytest.fixture(autouse=True)
def _isolated(monkeypatch):
    monkeypatch.setattr(service, "AUTH_TOKEN", "")
    reset_default_store()
    yield
    reset_default_store()


def govern(trajectory, headers=ID, **extra):
    r = client.post("/v1/govern", json={"trajectory": trajectory, **extra}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def th(trajectory, **kw):
    return govern(trajectory, **kw)["trajectory_hash"]


# ── reproduction: distinct trajectories must not share a trajectory_hash ────
def test_reproduction_same_deciding_step_different_history():
    a, b = govern([READ, DROP]), govern([BENIGN, DROP])
    assert a["verdict"] == b["verdict"] == "BLOCK"
    assert a["trajectory_hash"] != b["trajectory_hash"]


def test_reproduction_all_permitted_trajectories_differing_after_the_first_step():
    assert th([BENIGN, READ]) != th([BENIGN, READ2])


@pytest.mark.parametrize("left,right", [
    ([DROP], [BENIGN, DROP]),                         # insertion
    ([BENIGN, READ, DROP], [BENIGN, DROP]),           # removal
    ([READ, BENIGN, DROP], [BENIGN, READ, DROP]),     # reordering
    ([READ, DROP], [READ2, DROP]),                    # different parameters
    ([BENIGN], [BENIGN, BENIGN2]),                    # appended permitted step
])
def test_material_trajectory_changes_change_the_hash(left, right):
    assert th(left) != th(right)


# ── stability ──────────────────────────────────────────────────────────────
def test_hash_is_stable_across_repeats_key_order_and_restart():
    first = th([READ, DROP])
    assert th([READ, DROP]) == first
    reordered_keys = [{"args": {"path": "/data/customers.csv"}, "tool": "read_file"}, DROP]
    assert th(reordered_keys) == first
    reset_default_store()                               # restart the decision plane
    with TestClient(service.app) as fresh:
        r = fresh.post("/v1/govern", json={"trajectory": [READ, DROP]}, headers=ID)
        assert r.json()["trajectory_hash"] == first


def test_replay_endpoint_reports_the_same_trajectory_identity():
    """The gateway replays a /v1/govern decision through /v1/evaluate and
    compares trajectory_hash; the two endpoints must agree on identity."""
    governed = th([READ, DROP])
    replay = client.post("/v1/evaluate", json={"trajectory": [READ, DROP]}).json()
    assert replay["trajectory_hash"] == governed


# ── the declared binding, recomputed from the response's own evidence ──────
def _expected_trajectory_hash(steps):
    payload = {"schema": "morrison.trajectory.v1", "action_hashes": [action_hash(s) for s in steps]}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def test_trajectory_hash_is_recomputable_from_the_evaluated_steps():
    body = govern([READ, BENIGN, DROP])
    assert [d["action_hash"] for d in body["decisions"]] == [action_hash(s) for s in [READ, BENIGN, DROP]]
    assert body["trajectory_hash"] == _expected_trajectory_hash([READ, BENIGN, DROP])
    assert len(body["trajectory_hash"]) == 64                 # full SHA-256, not truncated


def test_deciding_action_hash_keeps_the_old_value_under_an_honest_name():
    body = govern([READ, DROP])
    assert body["deciding_action_hash"] == action_hash(DROP)


def test_trajectory_identity_is_independent_of_who_asked_but_the_decision_binding_is_not():
    a = govern([READ, DROP])
    b = govern([READ, DROP], headers={"x-governance-principal": "other-agent", "x-governance-tenant": "acme"})
    c = govern([READ, DROP], headers={"x-governance-principal": "pilot-agent", "x-governance-tenant": "globex"})
    assert a["trajectory_hash"] == b["trajectory_hash"] == c["trajectory_hash"]
    assert len({a["decision_binding_hash"], b["decision_binding_hash"], c["decision_binding_hash"]}) == 3


def test_policy_context_changes_the_decision_binding():
    base = govern([READ, BENIGN])
    other_domains = govern([READ, BENIGN], domains=["finance"])
    other_horizon = govern([READ, BENIGN], horizon=2)
    assert base["trajectory_hash"] == other_domains["trajectory_hash"] == other_horizon["trajectory_hash"]
    assert len({base["decision_binding_hash"], other_domains["decision_binding_hash"],
                other_horizon["decision_binding_hash"]}) == 3


def test_decision_binding_is_recomputable_from_the_response():
    body = govern([READ, DROP])
    b = body["binding"]
    assert b["trajectory_hash"] == body["trajectory_hash"]
    assert b["step_verdicts"] == [d["verdict"] for d in body["decisions"]]
    assert b["strictest_verdict"] == body["strictest_verdict"]
    assert b["principal"] == body["identity"]["principal"] and b["tenant"] == body["identity"]["tenant"]
    assert b["ruleset_hash"] == body["attestation"]["ruleset_hash"]
    recomputed = hashlib.sha256(json.dumps(b, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    assert body["decision_binding_hash"] == recomputed
