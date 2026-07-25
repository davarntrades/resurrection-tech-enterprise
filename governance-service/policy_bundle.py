"""
Guardian OS Sovereign — filesystem-backed Ω policy bundles.

The offline half of dynamic policy loading. In cloud deployments the engine
fetches active policies over HTTP (dynamic_rules._remote_rows); in on-prem,
sovereign and air-gapped deployments it reads exactly the same policy rows from
a SIGNED BUNDLE on disk — baked into the image at build time, or mounted as a
read-only volume. No database, no network, no vendor.

The bundle format is `guardian.bundle/1`, produced by the publisher with
lib/sovereign/bundle.js and verified here byte-for-byte:

  1. every entry's bytes hash to the sha256 recorded in the manifest;
  2. the manifest `digest` equals the recomputed digest of the entry list;
  3. the detached signature verifies under a key in the local trust store
     (Ed25519 via ed25519_verify.py, or HMAC-SHA256 with a pre-shared secret).

FAIL-CLOSED. A bundle that fails ANY layer yields ZERO policies and logs the
reason — it never yields "the policies we could parse". Since dynamic policies
are DENY-ONLY, dropping them can only ever remove constraints, never grant an
allow, so the static DEPLOYMENT_RULES baseline still governs every request. But
a sovereign operator must never be left believing an unverifiable bundle is
enforcing: `status()` reports the failure, and `guardian verify` fails on it.

Pure standard library. Config:
  GUARDIAN_POLICY_BUNDLE   path to a bundle directory or a .gos file (required)
  GUARDIAN_TRUST_DIR       directory of <key_id>.pub Ed25519 public keys
  GUARDIAN_BUNDLE_HMAC_KEY pre-shared secret for hmac-sha256 bundles
  GUARDIAN_REQUIRE_SIGNED  1 to refuse unsigned bundles (implied by sovereign
                           and air_gapped profiles)
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
from typing import Any, Optional

import ed25519_verify

log = logging.getLogger("governance.bundle")

FORMAT = "guardian.bundle/1"
MANIFEST_FILE = "manifest.json"
SIGNATURE_FILE = "manifest.sig"
POLICY_PREFIX = "policies/"

# Profiles whose policies come from a bundle rather than a database, and those
# that additionally refuse an unsigned one. Kept in sync with
# lib/sovereign/profiles.js (cross-checked by the sovereign test suite).
BUNDLE_PROFILES = {"on_prem", "sovereign", "air_gapped"}
SIGNED_PROFILES = {"sovereign", "air_gapped"}
OFFLINE_PROFILES = {"sovereign", "air_gapped"}


class BundleError(Exception):
    """A bundle that cannot be trusted. Never partially accepted."""


# ── Canonical encoding (must match lib/sovereign/bundle.js `canonical`) ──────
# Signatures cover canonical bytes: object keys sorted, no insignificant
# whitespace, JSON string escaping. The cross-language test in CI proves a
# Node-signed manifest verifies here and vice versa.
def canonical(v: Any) -> str:
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        # JSON.stringify(1.0) === "1" — normalise so integral floats agree.
        return str(int(v)) if v.is_integer() else repr(v)
    if isinstance(v, (list, tuple)):
        return "[" + ",".join(canonical(x) for x in v) + "]"
    if isinstance(v, dict):
        return "{" + ",".join(f"{json.dumps(str(k), ensure_ascii=False)}:{canonical(v[k])}" for k in sorted(v.keys())) + "}"
    raise BundleError(f"cannot canonicalise {type(v).__name__}")


def _sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def manifest_bytes(manifest: dict) -> bytes:
    """The exact bytes a signature covers: the manifest minus its signature."""
    return canonical({k: v for k, v in manifest.items() if k != "signature"}).encode("utf-8")


def entries_digest(entries: list) -> str:
    return _sha256(canonical([{"path": e.get("path"), "sha256": e.get("sha256"), "bytes": e.get("bytes")} for e in entries]).encode("utf-8"))


# ── Trust store ─────────────────────────────────────────────────────────────
def load_trust(trust_dir: Optional[str] = None, hmac_key: Optional[str] = None) -> dict:
    d = trust_dir or os.getenv("GUARDIAN_TRUST_DIR") or (BAKED_TRUST if os.path.isdir(BAKED_TRUST) else "")
    keys: dict[str, str] = {}
    if d and os.path.isdir(d):
        for f in sorted(os.listdir(d)):
            if not f.endswith(".pub"):
                continue
            try:
                with open(os.path.join(d, f), "r", encoding="utf-8") as fh:
                    body = "".join(ln.strip() for ln in fh if ln.strip() and not ln.strip().startswith("#"))
                if body:
                    keys[f[:-4]] = body
            except OSError:
                pass  # an unreadable key is simply not trusted
    k = hmac_key if hmac_key is not None else os.getenv("GUARDIAN_BUNDLE_HMAC_KEY")
    return {"dir": d or None, "keys": keys, "hmac_key": k or None, "count": len(keys)}


# ── Reading ─────────────────────────────────────────────────────────────────
def _safe_path(p: str) -> str:
    s = str(p)
    if not s or s != s.strip() or os.path.isabs(s) or s.startswith(("/", "\\")) or (len(s) > 1 and s[1] == ":"):
        raise BundleError(f"unsafe entry path {p!r}")
    if any(seg in ("..", "") for seg in s.replace("\\", "/").split("/")):
        raise BundleError(f"entry path must not traverse: {s}")
    return s


def read_bundle(target: str) -> dict:
    """Read a bundle from a directory or a .gos file → {manifest, files:{path: bytes}}."""
    if os.path.isdir(target):
        return _read_dir(target)
    with open(target, "r", encoding="utf-8") as fh:
        env = json.load(fh)
    if not isinstance(env, dict) or env.get("format") != FORMAT:
        raise BundleError(f"{target} is not a {FORMAT} bundle")
    files = {p: base64.b64decode(b) for p, b in (env.get("files") or {}).items()}
    return {"manifest": env.get("manifest") or {}, "files": files}


def _read_dir(d: str) -> dict:
    try:
        with open(os.path.join(d, MANIFEST_FILE), "r", encoding="utf-8") as fh:
            manifest = json.load(fh)
    except (OSError, ValueError) as e:
        raise BundleError(f"cannot read {os.path.join(d, MANIFEST_FILE)}: {e}") from e
    # A detached manifest.sig wins over an embedded block (re-signing in place).
    try:
        with open(os.path.join(d, SIGNATURE_FILE), "r", encoding="utf-8") as fh:
            sig = json.load(fh)
        if isinstance(sig, dict):
            manifest["signature"] = sig
    except (OSError, ValueError):
        pass
    listed = {e.get("path") for e in (manifest.get("entries") or [])}
    files: dict[str, bytes] = {}
    for root, _dirs, names in os.walk(d):
        for n in names:
            abs_p = os.path.join(root, n)
            rel = os.path.relpath(abs_p, d).replace(os.sep, "/")
            if rel in (MANIFEST_FILE, SIGNATURE_FILE):
                continue
            # Unlisted files are loaded too, so verify() can REJECT them rather
            # than silently ignoring something dropped into the directory.
            try:
                with open(abs_p, "rb") as fh:
                    files[rel] = fh.read()
            except OSError:
                pass
    # A listed-but-absent entry is deliberately left out of `files` so that
    # verify() reports it as a missing entry rather than as empty content.
    del listed
    return {"manifest": manifest, "files": files}


# ── Verification ────────────────────────────────────────────────────────────
def verify(bundle: dict, trust: Optional[dict] = None, require_signature: bool = False) -> dict:
    """Full three-layer verification. Returns a report; collects EVERY failure
    reason rather than stopping at the first, so an operator sees the whole
    problem in one pass."""
    errors: list[str] = []
    t = trust if trust is not None else load_trust()
    manifest = bundle.get("manifest") or {}
    files = bundle.get("files") or {}

    if manifest.get("format") != FORMAT:
        errors.append(f"unsupported bundle format {manifest.get('format')!r} (expected {FORMAT})")

    entries = manifest.get("entries") or []
    if not entries:
        errors.append("manifest lists no entries")
    for e in entries:
        try:
            p = _safe_path(e.get("path"))
        except BundleError as err:
            errors.append(str(err))
            continue
        if p not in files:
            errors.append(f"missing entry {p}")
            continue
        buf = files[p]
        if _sha256(buf) != e.get("sha256"):
            errors.append(f"entry {p} content does not match its manifest hash")
        if len(buf) != e.get("bytes"):
            errors.append(f"entry {p} byte length does not match the manifest")
    listed = {e.get("path") for e in entries}
    for p in files:
        if p not in listed:
            errors.append(f"unlisted file {p} present in the bundle")

    if entries_digest(entries) != manifest.get("digest"):
        errors.append("manifest digest does not match its entry list")

    sig = manifest.get("signature") or {"alg": "none"}
    alg = sig.get("alg") or "none"
    signed = alg != "none"
    if not signed and require_signature:
        errors.append("bundle is unsigned and this deployment profile requires a verified signature")
    elif signed:
        msg = manifest_bytes(manifest)
        if alg == "ed25519":
            pub_b64 = t["keys"].get(sig.get("key_id") or "")
            if not pub_b64:
                errors.append(f"no trusted key {sig.get('key_id')!r} in the trust store ({t['dir']})")
            else:
                try:
                    ok = ed25519_verify.verify(base64.b64decode(pub_b64), msg, base64.b64decode(sig.get("value") or ""))
                except Exception as e:  # noqa: BLE001
                    ok = False
                    errors.append(f"signature verification failed: {e}")
                if not ok:
                    errors.append("ed25519 signature does not verify against the trusted key")
        elif alg == "hmac-sha256":
            if not t["hmac_key"]:
                errors.append("no HMAC key configured (set GUARDIAN_BUNDLE_HMAC_KEY)")
            else:
                expect = hmac.new(str(t["hmac_key"]).encode("utf-8"), msg, hashlib.sha256).digest()
                try:
                    got = base64.b64decode(sig.get("value") or "")
                except Exception:  # noqa: BLE001
                    got = b""
                if not hmac.compare_digest(expect, got):
                    errors.append("hmac-sha256 signature does not verify")
        else:
            errors.append(f"unsupported signature algorithm {alg!r}")

    return {
        "ok": not errors,
        "signed": signed,
        "alg": alg,
        "key_id": sig.get("key_id"),
        "kind": manifest.get("kind"),
        "id": manifest.get("id"),
        "version": manifest.get("version"),
        "entries": len(entries),
        "errors": errors,
    }


# ── Policy extraction ───────────────────────────────────────────────────────
def policy_rows(bundle: dict) -> list[dict]:
    """Every active policy in a VERIFIED bundle, in the SAME row shape the
    remote provider returns — {name, domain, spec, version, hash} — so
    dynamic_rules._refresh() is identical whichever provider fed it. That
    sameness is the whole point: the kernel does not know or care where a
    policy came from."""
    rows: list[dict] = []
    files = bundle.get("files") or {}
    for path in sorted(p for p in files if p.startswith(POLICY_PREFIX) and p.endswith(".json")):
        try:
            doc = json.loads(files[path].decode("utf-8"))
        except (ValueError, UnicodeDecodeError) as e:
            log.warning("policy bundle entry %s is not valid JSON — skipped: %s", path, e)
            continue
        for item in (doc if isinstance(doc, list) else [doc]):
            if not isinstance(item, dict):
                continue
            status = str(item.get("status") or "active").lower()
            if status != "active":
                continue
            spec = item.get("spec")
            if not isinstance(spec, dict):
                log.warning("policy bundle entry %s has no spec object — skipped", path)
                continue
            name = item.get("name") or spec.get("name")
            domain = item.get("domain") or spec.get("domain")
            # The control plane stores the spec with `name` and `domain` folded
            # in (govpolicy.draft: `full = {...spec, name, domain}`), and
            # compile_spec requires both. A bundle author writes them once, at
            # the top level of the document, so fold them in here — otherwise
            # the same policy that compiles from the database would be rejected
            # from a bundle, and the two providers would not actually be equal.
            spec = {**spec, "name": name, "domain": domain}
            rows.append({
                "name": name,
                "domain": domain,
                "spec": spec,
                "version": item.get("version") or 1,
                "hash": item.get("hash") or _sha256(canonical(spec).encode("utf-8"))[:32],
                "scope": item.get("scope") or "global",
            })
    return rows


# ── The provider dynamic_rules calls ────────────────────────────────────────
_state: dict[str, Any] = {"path": None, "loaded_at": None, "report": None, "rows": [], "mtime": None}


# Conventional locations inside a sovereign image (see the Dockerfile's
# POLICY_BUNDLE / TRUST_BUNDLE build args). Used ONLY when they actually exist,
# so a cloud image — which bakes neither — is completely unaffected and still
# resolves to the remote provider.
BAKED_BUNDLE = "/app/policy-bundle"
BAKED_TRUST = "/app/trust"


def bundle_path() -> Optional[str]:
    p = os.getenv("GUARDIAN_POLICY_BUNDLE")
    if p:
        return p
    return BAKED_BUNDLE if os.path.isdir(BAKED_BUNDLE) else None


def require_signed() -> bool:
    raw = str(os.getenv("GUARDIAN_REQUIRE_SIGNED") or "").strip().lower()
    if raw in ("1", "true", "yes", "on"):
        return True
    return (os.getenv("GUARDIAN_PROFILE") or "").strip().lower().replace("-", "_").replace(" ", "_") in SIGNED_PROFILES


def _mtime(target: str) -> Optional[float]:
    """Newest mtime under the bundle — lets a mounted bundle be re-read after an
    offline update without restarting the service, while a baked-in bundle
    simply never changes."""
    try:
        if os.path.isfile(target):
            return os.path.getmtime(target)
        newest = os.path.getmtime(target)
        for root, _dirs, names in os.walk(target):
            for n in names:
                newest = max(newest, os.path.getmtime(os.path.join(root, n)))
        return newest
    except OSError:
        return None


def hot_reload() -> bool:
    """OFF by default. A sovereign deployment is deterministic: the ruleset a
    box boots with is the ruleset it enforces until it is deliberately updated
    and restarted. Enabling this lets a mounted bundle be re-read in place after
    an offline update — convenient in on-prem staging, deliberately not the
    default anywhere, and irrelevant to a baked-in bundle that cannot change."""
    return str(os.getenv("GUARDIAN_POLICY_HOT_RELOAD") or "").strip().lower() in ("1", "true", "yes", "on")


def load(force: bool = False) -> list[dict]:
    """Verified policy rows from the configured bundle. Returns [] (and records
    why) on any failure — fail-closed, never partially trusted."""
    target = bundle_path()
    if not target:
        _state.update(path=None, report={"ok": False, "errors": ["GUARDIAN_POLICY_BUNDLE is not set"]}, rows=[])
        return []
    mt = _mtime(target) if hot_reload() else _state.get("mtime")
    if not force and _state["path"] == target and _state["mtime"] == mt and _state["report"] is not None:
        return _state["rows"]
    if not hot_reload():
        mt = _mtime(target)   # recorded for evidence; not used to trigger reloads
    try:
        bundle = read_bundle(target)
        report = verify(bundle, require_signature=require_signed())
        rows = policy_rows(bundle) if report["ok"] else []
        if not report["ok"]:
            log.error("policy bundle %s REJECTED (%d policies withheld): %s", target, len(policy_rows(bundle)), "; ".join(report["errors"]))
        else:
            log.info("policy bundle %s verified: %s v%s, %d policies, signature %s",
                     target, report["id"], report["version"], len(rows), report["alg"])
    except (BundleError, OSError, ValueError) as e:
        report = {"ok": False, "errors": [str(e)], "signed": False, "alg": None, "key_id": None}
        rows = []
        log.error("policy bundle %s could not be read: %s", target, e)
    _state.update(path=target, mtime=mt, report=report, rows=rows)
    return rows


def status() -> dict:
    r = _state.get("report") or {}
    return {
        "path": _state.get("path"),
        "ok": bool(r.get("ok")),
        "signed": bool(r.get("signed")),
        "alg": r.get("alg"),
        "key_id": r.get("key_id"),
        "bundle_id": r.get("id"),
        "bundle_version": r.get("version"),
        "policies": len(_state.get("rows") or []),
        "require_signed": require_signed(),
        "hot_reload": hot_reload(),
        "errors": r.get("errors") or [],
    }
