#!/usr/bin/env python3
"""Offline evidence auditor.

Verifies an exported governance evidence chain WITHOUT the service, without its
keys, and without network access. Two levels:

  keyless   recompute every record hash and chain link from the export alone.
            Detects edited fields, forged verdicts, deleted or reordered
            records, and any record marked executed without a PERMIT.
            Requires nothing but the file.

  attested  additionally verify an Ed25519 attestation over the chain head,
            signed by an EXTERNAL notary. The service does not hold that
            private key, so it cannot mint an attestation for a chain it
            rewrote — this is what makes the check independent rather than
            self-reported.

    python3 attest.py verify --chain chain.jsonl
    python3 attest.py verify --chain chain.jsonl --attestation att.json \
                             --pubkey <64-hex-chars>
    python3 attest.py verify --chain chain.jsonl --anchors anchors.json

Exit 0 only if every requested check passes.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from morrison_governance.kernel.attestation import (
    AnchorLog, ChainAttestation, recompute_chain, verify_attestation,
)
from morrison_governance.kernel.ed25519 import verify as ed25519_verify


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("verify")
    v.add_argument("--chain", required=True, help="evidence chain JSONL export")
    v.add_argument("--attestation", help="attestation JSON from the notary")
    v.add_argument("--pubkey", help="notary Ed25519 public key (64 hex chars)")
    v.add_argument("--anchors", help="exported anchor log JSON")
    args = ap.parse_args()

    jsonl = Path(args.chain).read_text()
    failures: list[str] = []

    res = recompute_chain(jsonl)
    print(f"keyless recomputation : {'PASS' if res.ok else 'FAIL'} "
          f"({res.count} records, head {res.head[:16]}…)")
    for p in res.problems:
        print("   ✗", p)
    if not res.ok:
        failures.append("keyless")

    if args.attestation:
        if not args.pubkey:
            print("attestation           : FAIL — --pubkey is required")
            failures.append("attestation")
        else:
            att = ChainAttestation.from_dict(
                json.loads(Path(args.attestation).read_text()))
            ares = verify_attestation(jsonl, att, bytes.fromhex(args.pubkey),
                                      ed25519_verify)
            print(f"external attestation  : {'PASS' if ares.ok else 'FAIL'} "
                  f"(signer {att.signer_key_id!r})")
            for p in ares.problems:
                print("   ✗", p)
            if not ares.ok:
                failures.append("attestation")
    else:
        print("external attestation  : SKIPPED (no --attestation supplied) — "
              "content integrity is proven, authorship is not")

    if args.anchors:
        anchors = AnchorLog.from_json(Path(args.anchors).read_text())
        nres = anchors.check(jsonl)
        print(f"anchor consistency    : {'PASS' if nres.ok else 'FAIL'} "
              f"({len(anchors.anchors)} anchors)")
        for p in nres.problems:
            print("   ✗", p)
        if not nres.ok:
            failures.append("anchors")
        print("   note:", AnchorLog.independence_note())

    print()
    if failures:
        print(f"VERIFICATION FAILED: {', '.join(failures)}")
        return 1
    print("VERIFICATION PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
