#!/usr/bin/env bash
# ============================================================================
# Guardian OS Sovereign — offline media builder.
#
# Run this ONCE on a connected build host. It produces a single directory that
# can be written to removable media and carried into a disconnected estate,
# containing everything needed to stand Guardian OS up with no network:
#
#   images/        guardian-engine + guardian-app as docker-loadable tars
#   policy-bundle/ the signed Ω policy bundle (also baked into the engine image)
#   packs/         signed Industry Intelligence Pack bundles
#   trust/         the PUBLIC signing keys (the private key never travels)
#   deploy/        compose file, env template, systemd units, installer
#   docs/          SOVEREIGN.md, ACCREDITATION.md, FIELD-TRIAL.md
#   MANIFEST.txt   sha256 of every file, so the media itself is verifiable
#
# The private signing key is NEVER copied here. That is the point of Ed25519:
# the estate needs only the 32-byte public key to verify what it installs.
#
#   deploy/sovereign/build-media.sh --key ./keys/acme-release.pem \
#     --key-id acme-release --version 1.0.0 --out ./media
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="./media"; KEY=""; KEY_ID=""; VERSION="1.0.0"; POLICY_SRC="$ROOT/deploy/sovereign/policies"; SKIP_IMAGES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    --key) KEY="$2"; shift 2 ;;
    --key-id) KEY_ID="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --policies) POLICY_SRC="$2"; shift 2 ;;
    --skip-images) SKIP_IMAGES=1; shift ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done

[[ -n "$KEY" ]] || { echo "--key <signing-key.pem> is required (create one with: guardian keygen)" >&2; exit 2; }
[[ -f "$KEY" ]] || { echo "signing key $KEY not found" >&2; exit 2; }
KEY_ID="${KEY_ID:-$(basename "$KEY" .pem)}"

cd "$ROOT"
mkdir -p "$OUT"/{images,packs,trust,deploy,docs}
echo "==> Guardian OS Sovereign media, version $VERSION, signed by $KEY_ID"

# ── 1. Trust store: the PUBLIC key only ─────────────────────────────────────
PUB="$(dirname "$KEY")/$KEY_ID.pub"
[[ -f "$PUB" ]] || { echo "public key $PUB not found beside the private key" >&2; exit 2; }
cp "$PUB" "$OUT/trust/"
echo "    trust store: $KEY_ID.pub (the private key is NOT copied and never travels)"

# ── 2. Signed policy bundle ─────────────────────────────────────────────────
if [[ -d "$POLICY_SRC" ]]; then
  node bin/guardian.cjs bundle policies "$POLICY_SRC" --dir \
    --id guardian-policies --version "$VERSION" --out "$OUT/policy-bundle" \
    --sign-key "$KEY" --key-id "$KEY_ID"
  GUARDIAN_TRUST_DIR="$OUT/trust" node bin/guardian.cjs verify "$OUT/policy-bundle"
else
  echo "    no policy source at $POLICY_SRC — media will carry no policy bundle" >&2
  echo "    (the engine will enforce the static deployment baseline only)" >&2
fi

# ── 3. Signed industry pack bundles ─────────────────────────────────────────
node bin/guardian.cjs pack export --all --out "$OUT/packs" --sign-key "$KEY" --key-id "$KEY_ID"
for p in "$OUT"/packs/*.pack; do GUARDIAN_TRUST_DIR="$OUT/trust" node bin/guardian.cjs verify "$p" >/dev/null; done
echo "    packs: $(ls -1 "$OUT"/packs/*.pack | wc -l) signed bundle(s), all verified"

# ── 4. Images ───────────────────────────────────────────────────────────────
if [[ "$SKIP_IMAGES" -eq 0 ]]; then
  echo "==> building images (this is the only step that needs the internet)"
  docker build -f governance-service/Dockerfile \
    ${POLICY_SRC:+--build-arg POLICY_BUNDLE="$OUT/policy-bundle"} \
    --build-arg TRUST_BUNDLE="$OUT/trust" \
    -t "guardian-engine:$VERSION" .
  docker build -f deploy/sovereign/Dockerfile.app -t "guardian-app:$VERSION" .

  # Prove the engine image governs with no network BEFORE it ships.
  echo "==> proving the engine image works with --network none"
  docker run --rm --network none -e GUARDIAN_PROFILE=air_gapped "guardian-engine:$VERSION" python -c "
import dynamic_rules as dr, sys
st = dr.status()
assert st['provider'] == 'bundle', 'image does not read the baked policy bundle'
assert st['bundle']['ok'], 'baked bundle failed verification: %s' % st['bundle']['errors']
print('    engine image verified offline: %d policy(ies), %s signature' % (st['bundle']['policies'], st['bundle']['alg']))
"
  docker save "guardian-engine:$VERSION" -o "$OUT/images/guardian-engine-$VERSION.tar"
  docker save "guardian-app:$VERSION"    -o "$OUT/images/guardian-app-$VERSION.tar"
  echo "    images: $(du -sh "$OUT/images" | cut -f1)"
fi

# ── 5. Deployment + documentation ───────────────────────────────────────────
cp deploy/sovereign/docker-compose.yml deploy/sovereign/guardian.env.example \
   deploy/sovereign/install.sh deploy/sovereign/README.md "$OUT/deploy/"
cp deploy/sovereign/*.service "$OUT/deploy/" 2>/dev/null || true
cp docs/SOVEREIGN.md docs/ACCREDITATION.md docs/FIELD-TRIAL.md "$OUT/docs/" 2>/dev/null || true
chmod +x "$OUT/deploy/install.sh"

# ── 6. Manifest — the media itself is verifiable ────────────────────────────
( cd "$OUT" && find . -type f ! -name MANIFEST.txt -print0 | sort -z | xargs -0 sha256sum > MANIFEST.txt )
echo "    manifest: $(wc -l < "$OUT/MANIFEST.txt") file(s)"

cat > "$OUT/VERSION" <<EOF
guardian-os-sovereign
version=$VERSION
signed_by=$KEY_ID
built=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

echo
echo "==> media ready: $OUT ($(du -sh "$OUT" | cut -f1))"
echo "    verify on arrival:  cd <media> && sha256sum -c MANIFEST.txt"
echo "    then install:       sudo deploy/install.sh"
