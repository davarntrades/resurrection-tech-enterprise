#!/usr/bin/env bash
# ============================================================================
# Guardian OS Sovereign — offline installer.
#
# Run from the root of the media set, on the target host, with NO network:
#
#   sha256sum -c MANIFEST.txt      # verify the media before trusting it
#   sudo deploy/install.sh
#
# Everything installed here already exists on the media. This script pulls
# nothing, downloads nothing and contacts nothing.
# ============================================================================
set -euo pipefail

MEDIA="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${GUARDIAN_HOME:-/opt/guardian}"

echo "==> Guardian OS Sovereign installer"
echo "    media:  $MEDIA"
echo "    target: $TARGET"

# 1. Verify the media before trusting a single byte of it.
if [[ -f "$MEDIA/MANIFEST.txt" ]]; then
  echo "==> verifying media manifest"
  ( cd "$MEDIA" && sha256sum -c MANIFEST.txt --quiet ) \
    || { echo "MEDIA VERIFICATION FAILED — do not install" >&2; exit 1; }
  echo "    manifest OK"
else
  echo "!!  no MANIFEST.txt on this media — refusing to install unverified content" >&2
  exit 1
fi

command -v docker >/dev/null || { echo "docker is required and must already be installed" >&2; exit 1; }

# 2. Load the images from the media.
echo "==> loading images"
for tar in "$MEDIA"/images/*.tar; do
  [[ -f "$tar" ]] || continue
  docker load -i "$tar" | sed 's/^/    /'
done

# 3. Lay down the deployment.
echo "==> installing to $TARGET"
install -d -m 0755 "$TARGET" "$TARGET/trust" "$TARGET/packs"
install -m 0644 "$MEDIA/deploy/docker-compose.yml" "$TARGET/"
install -m 0644 "$MEDIA/trust"/*.pub "$TARGET/trust/" 2>/dev/null || true
cp -r "$MEDIA/packs/." "$TARGET/packs/" 2>/dev/null || true
[[ -d "$MEDIA/policy-bundle" ]] && cp -r "$MEDIA/policy-bundle" "$TARGET/" || true
[[ -d "$MEDIA/docs" ]] && cp -r "$MEDIA/docs" "$TARGET/" || true

# 4. Configuration — generated ON THE ESTATE, never carried on media.
if [[ ! -f "$TARGET/.env" ]]; then
  echo "==> generating local secrets (these are created here and never leave)"
  install -m 0600 "$MEDIA/deploy/guardian.env.example" "$TARGET/.env"
  sed -i "s|^GOVERNANCE_TOKEN=.*|GOVERNANCE_TOKEN=$(openssl rand -hex 32)|" "$TARGET/.env"
  sed -i "s|^ADMIN_KEY=.*|ADMIN_KEY=$(openssl rand -hex 32)|" "$TARGET/.env"
  [[ -f "$MEDIA/VERSION" ]] && sed -i "s|^GUARDIAN_VERSION=.*|GUARDIAN_VERSION=$(grep '^version=' "$MEDIA/VERSION" | cut -d= -f2)|" "$TARGET/.env"
  echo "    wrote $TARGET/.env (0600)"
else
  echo "    $TARGET/.env exists — left untouched"
fi

# 5. Optional: systemd, so the estate manages it like any other service.
if [[ -d /etc/systemd/system ]] && compgen -G "$MEDIA/deploy/*.service" >/dev/null; then
  echo "==> installing systemd units"
  install -m 0644 "$MEDIA"/deploy/*.service /etc/systemd/system/
  systemctl daemon-reload
  echo "    enable with: systemctl enable --now guardian-os"
fi

cat <<NEXT

==> installed.

    Start:      cd $TARGET && docker compose up -d
    Accept:     docker compose exec app node bin/guardian.cjs acceptance \\
                  --site "<site>" --operator "<you>" --witness "<witness>" \\
                  --pdf /data/acceptance-record.pdf
    Verify:     docker compose exec app node bin/guardian.cjs verify
    Packs:      docker compose exec app node bin/guardian.cjs pack install /packs/finance.pack

    The acceptance record is the artefact to retain. A run with no site and no
    witness is a self-test, not a field trial, and the record will say so.
NEXT
