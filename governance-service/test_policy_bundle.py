"""
Guardian OS Sovereign — offline policy bundle tests (engine side).

Proves the air-gapped policy path end to end, with no network and no database:

  1. CANONICAL    canonical() is stable, key-order independent, and matches the
                  contract lib/sovereign/bundle.js signs against.
  2. INTEGRITY    a tampered entry, a tampered entry LIST, a missing entry and an
                  unlisted extra file are each rejected.
  3. SIGNATURE    an HMAC-signed bundle verifies; a forged one does not; an
                  unsigned bundle is refused when the profile requires signing.
  4. FAIL-CLOSED  a rejected bundle yields ZERO policies (never "the ones that
                  parsed"), and status() reports why.
  5. PROVIDER     dynamic_rules resolves to the bundle provider under offline
                  profiles, REFUSES remote there even with SUPABASE_URL set, and
                  compiles bundled specs into real DENY-ONLY Ω rules.

    PYTHONPATH=/path/to/engine python governance-service/test_policy_bundle.py

Ed25519 interoperability with the Node signer is proven separately, and for
real, by scripts/sovereign/crosslang.test.cjs in CI.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import policy_bundle as pb  # noqa: E402

PASS = 0
FAIL = 0


def ok(cond, name, detail=None):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  [PASS] {name}")
    else:
        FAIL += 1
        print(f"  [FAIL] {name}" + (f" — {detail}" if detail is not None else ""))


# Deliberately WITHOUT `name`/`domain` inside the spec: a bundle author writes
# those once at the top level of the document. policy_rows() must fold them in
# exactly as govpolicy.draft does for the database provider, or a policy that
# compiles from the control plane would be rejected from a bundle.
SPEC = {
    "match": {"tools": ["wire_transfer"]},
    "conditions": {"threshold": {"field": "amount", "op": ">", "value": 10000}},
    "severity": "critical",
    "description": "Wire transfers above 10,000 require an approved exception.",
}
POLICY_NAME = "sovereign_wire_transfer_cap"


def build_dir(tmp, *, sign_secret=None, policies=None, extra_files=None):
    """Build a bundle directory the way lib/sovereign/bundle.js would."""
    d = os.path.join(tmp, "bundle")
    os.makedirs(os.path.join(d, "policies"), exist_ok=True)
    docs = policies if policies is not None else [{"name": POLICY_NAME, "domain": "finance", "status": "active", "version": 1, "spec": SPEC}]
    entries = []
    for i, doc in enumerate(docs):
        rel = f"policies/{doc.get('name', 'policy')}.json"
        body = json.dumps(doc, indent=2).encode("utf-8")
        with open(os.path.join(d, rel), "wb") as fh:
            fh.write(body)
        entries.append({"path": rel, "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body)})
        del i
    for rel, body in (extra_files or {}).items():
        p = os.path.join(d, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "wb") as fh:
            fh.write(body)
    entries.sort(key=lambda e: e["path"])
    manifest = {
        "format": pb.FORMAT, "kind": "policies", "id": "sovereign-test", "version": "1.0.0",
        "created_at": "2026-07-25T00:00:00.000Z", "produced_by": "test", "requires": {}, "metadata": {},
        "entries": entries, "digest": pb.entries_digest(entries),
    }
    if sign_secret:
        value = base64.b64encode(hmac.new(sign_secret.encode(), pb.manifest_bytes(manifest), hashlib.sha256).digest()).decode()
        manifest["signature"] = {"alg": "hmac-sha256", "key_id": "test-key", "value": value}
    else:
        manifest["signature"] = {"alg": "none", "key_id": None, "value": None}
    with open(os.path.join(d, pb.MANIFEST_FILE), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
    return d


def main():
    tmp = tempfile.mkdtemp(prefix="gos-bundle-test-")
    try:
        print("\nSovereign policy bundle test (no network, no database)\n")

        # ── 1. Canonical encoding ────────────────────────────────────────────
        ok(pb.canonical({"b": 1, "a": 2}) == '{"a":2,"b":1}', "canonical() sorts object keys")
        ok(pb.canonical({"a": {"z": [1, 2], "y": "x"}}) == '{"a":{"y":"x","z":[1,2]}}', "canonical() recurses into arrays + objects")
        ok(pb.canonical(1.0) == "1", "canonical() normalises integral floats the way JSON.stringify does")
        ok(pb.canonical(True) == "true" and pb.canonical(None) == "null", "canonical() emits JSON literals")

        # ── 2. A good bundle verifies and yields policies ────────────────────
        good = build_dir(tmp, sign_secret="s3cret")
        b = pb.read_bundle(good)
        rep = pb.verify(b, trust={"dir": None, "keys": {}, "hmac_key": "s3cret", "count": 0}, require_signature=True)
        ok(rep["ok"], "a signed, intact bundle verifies", rep["errors"])
        rows = pb.policy_rows(b)
        ok(len(rows) == 1 and rows[0]["name"] == POLICY_NAME and rows[0]["domain"] == "finance",
           "policy_rows() returns the SAME row shape the remote provider returns", rows)
        ok(set(rows[0]) >= {"name", "domain", "spec", "version", "hash"}, "row carries name/domain/spec/version/hash")
        ok(rows[0]["spec"].get("name") == POLICY_NAME and rows[0]["spec"].get("domain") == "finance",
           "name + domain are folded INTO the spec, exactly as the control plane stores them", rows[0]["spec"])

        # ── 3. Integrity — every tamper is caught ────────────────────────────
        t = os.path.join(tmp, "tampered")
        shutil.copytree(good, t)
        with open(os.path.join(t, f"policies/{POLICY_NAME}.json"), "a", encoding="utf-8") as fh:
            fh.write(" ")
        rep = pb.verify(pb.read_bundle(t), trust={"dir": None, "keys": {}, "hmac_key": "s3cret", "count": 0})
        ok(not rep["ok"] and any("does not match its manifest hash" in e for e in rep["errors"]),
           "a tampered policy file is rejected (content hash)", rep["errors"])

        t2 = os.path.join(tmp, "tampered-list")
        shutil.copytree(good, t2)
        with open(os.path.join(t2, pb.MANIFEST_FILE), "r+", encoding="utf-8") as fh:
            m = json.load(fh)
            m["entries"] = []          # drop the policy from the list
            fh.seek(0); json.dump(m, fh); fh.truncate()
        rep = pb.verify(pb.read_bundle(t2), trust={"dir": None, "keys": {}, "hmac_key": "s3cret", "count": 0})
        ok(not rep["ok"] and any("digest does not match" in e for e in rep["errors"]),
           "removing an entry from the manifest list is rejected (entry digest)", rep["errors"])

        t3 = os.path.join(tmp, "extra-file")
        shutil.copytree(good, t3)
        with open(os.path.join(t3, "policies/smuggled.json"), "w", encoding="utf-8") as fh:
            json.dump({"name": "smuggled", "domain": "finance", "spec": SPEC}, fh)
        rep = pb.verify(pb.read_bundle(t3), trust={"dir": None, "keys": {}, "hmac_key": "s3cret", "count": 0})
        ok(not rep["ok"] and any("unlisted file" in e for e in rep["errors"]),
           "a file smuggled into the directory is rejected, not silently installed", rep["errors"])

        t4 = os.path.join(tmp, "missing")
        shutil.copytree(good, t4)
        os.remove(os.path.join(t4, f"policies/{POLICY_NAME}.json"))
        rep = pb.verify(pb.read_bundle(t4), trust={"dir": None, "keys": {}, "hmac_key": "s3cret", "count": 0})
        ok(not rep["ok"] and any("missing entry" in e for e in rep["errors"]), "a missing entry is rejected", rep["errors"])

        # ── 4. Signature ─────────────────────────────────────────────────────
        rep = pb.verify(pb.read_bundle(good), trust={"dir": None, "keys": {}, "hmac_key": "wrong", "count": 0})
        ok(not rep["ok"] and any("hmac-sha256 signature does not verify" in e for e in rep["errors"]),
           "a bundle signed with a different key does not verify", rep["errors"])
        rep = pb.verify(pb.read_bundle(good), trust={"dir": None, "keys": {}, "hmac_key": None, "count": 0})
        ok(not rep["ok"], "a signed bundle with no configured key does not verify (no trust anchor, no install)")

        unsigned = build_dir(os.path.join(tmp, "u"), sign_secret=None)
        rep = pb.verify(pb.read_bundle(unsigned), trust={"dir": None, "keys": {}, "hmac_key": None, "count": 0}, require_signature=True)
        ok(not rep["ok"] and any("requires a verified signature" in e for e in rep["errors"]),
           "an unsigned bundle is REFUSED where the profile requires signing", rep["errors"])
        rep = pb.verify(pb.read_bundle(unsigned), trust={"dir": None, "keys": {}, "hmac_key": None, "count": 0}, require_signature=False)
        ok(rep["ok"], "the same unsigned bundle is accepted on-prem where signing is not mandated", rep["errors"])

        # ── 5. Fail-closed loading + provider selection ──────────────────────
        for k in ("GUARDIAN_PROFILE", "GOVERNANCE_POLICY_PROVIDER", "GUARDIAN_REQUIRE_SIGNED",
                  "GUARDIAN_BUNDLE_HMAC_KEY", "GUARDIAN_TRUST_DIR", "GUARDIAN_POLICY_HOT_RELOAD"):
            os.environ.pop(k, None)

        os.environ["GUARDIAN_POLICY_BUNDLE"] = t          # the tampered bundle
        os.environ["GUARDIAN_BUNDLE_HMAC_KEY"] = "s3cret"
        pb._state.update(path=None, mtime=None, report=None, rows=[])
        ok(pb.load() == [], "a bundle that fails verification yields ZERO policies (fail-closed)")
        st = pb.status()
        ok(st["ok"] is False and st["policies"] == 0 and st["errors"], "status() reports the rejection and its reason", st["errors"][:1])

        os.environ["GUARDIAN_POLICY_BUNDLE"] = good
        pb._state.update(path=None, mtime=None, report=None, rows=[])
        loaded = pb.load()
        ok(len(loaded) == 1, "the good bundle loads its policies", len(loaded))
        ok(pb.status()["ok"] and pb.status()["signed"] and pb.status()["alg"] == "hmac-sha256", "status() reports a verified, signed bundle")
        ok(pb.hot_reload() is False, "hot reload is OFF by default (deterministic deployments)")

        import dynamic_rules as dr  # noqa: E402 — imported here so env is set first

        os.environ["GUARDIAN_PROFILE"] = "air_gapped"
        os.environ["SUPABASE_URL"] = "https://example.supabase.co"
        os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "should-never-be-used"
        ok(dr.provider() == "bundle", "an air-gapped profile resolves to the bundle provider", dr.provider())
        os.environ["GOVERNANCE_POLICY_PROVIDER"] = "remote"
        ok(dr.provider() == "bundle", "an explicit GOVERNANCE_POLICY_PROVIDER=remote is REFUSED under an offline profile", dr.provider())
        os.environ.pop("GOVERNANCE_POLICY_PROVIDER")

        # The bundled spec compiles into a real DENY-ONLY Ω rule.
        os.environ["GUARDIAN_REQUIRE_SIGNED"] = "1"
        pb._state.update(path=None, mtime=None, report=None, rows=[])
        dr._cache.update(rules=[], generation=0, hash=None, fetched_at=0.0, count=0)
        rules = dr.active_rules()
        ok(len(rules) == 1, "the engine loads the bundled policy as an Ω rule with no network", len(rules))
        if rules:
            r = rules[0]
            ok(r.check({"tool": "wire_transfer", "amount": 25000}) is True, "the bundled rule BLOCKS the violating state")
            ok(r.check({"tool": "wire_transfer", "amount": 500}) is False, "the bundled rule allows a compliant state")
            ok(r.check({"tool": "send_email"}) is False, "the bundled rule never reaches an unrelated tool")
        st = dr.status()
        ok(st["provider"] == "bundle" and st["profile"] == "air_gapped" and st["bundle"]["ok"],
           "dynamic_rules.status() exposes the provider, profile and bundle verification state", st)

        os.environ["GUARDIAN_PROFILE"] = "cloud"
        os.environ.pop("GUARDIAN_POLICY_BUNDLE")
        ok(dr.provider() == "remote", "a cloud profile with a DB configured still resolves to the remote provider", dr.provider())

        print(f"\n{PASS}/{PASS + FAIL} passed")
        return 1 if FAIL else 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
