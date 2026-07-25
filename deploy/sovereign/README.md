# Guardian OS Sovereign — reference deployment

The artefacts a customer actually installs. Two containers, one internal bridge,
no external network, no Chromium, no package registry.

> **What this is and is not.** This is a *reference* deployment: a complete,
> runnable topology that has been proven in CI with egress removed. It is not a
> record of an installation on customer hardware. Turning it into one is
> [`docs/FIELD-TRIAL.md`](../../docs/FIELD-TRIAL.md).

## Bill of materials

| Item | What it is | Built by |
|---|---|---|
| `guardian-engine:<v>` | the Ω engine with a signed policy bundle + trust store baked in | `governance-service/Dockerfile` |
| `guardian-app:<v>` | the platform + offline-clean interface (no fonts, no telemetry, no browser) | `Dockerfile.app` |
| `policy-bundle/` | the estate's signed Ω policies | `guardian bundle policies` |
| `packs/*.pack` | signed Industry Intelligence Pack bundles | `guardian pack export --all` |
| `trust/*.pub` | **public** signing keys — the private key never travels | `guardian keygen` |
| `MANIFEST.txt` | sha256 of every file on the media | `build-media.sh` |

## Build the media (connected host, once)

```bash
guardian keygen --key-id acme-release --out ./keys
deploy/sovereign/build-media.sh \
  --key ./keys/acme-release.pem --key-id acme-release \
  --version 1.0.0 --policies ./deploy/sovereign/policies --out ./media
```

The builder verifies every bundle it produces and boots the engine image with
`--network none` to prove it governs offline **before** the media ships. If that
check fails, no media is produced.

## Install (target host, no network)

```bash
cd /media/guardian
sha256sum -c MANIFEST.txt          # verify the media BEFORE trusting it
sudo deploy/install.sh
cd /opt/guardian && docker compose up -d
```

`install.sh` refuses to run without a manifest, generates `GOVERNANCE_TOKEN` and
`ADMIN_KEY` **on the estate** (secrets never travel on media), and loads images
only from the media.

## Accept, verify, operate

```bash
docker compose exec app node bin/guardian.cjs acceptance \
  --site "Site B rack 4" --operator "..." --witness "..." --pdf /data/acceptance.pdf
docker compose exec app node bin/guardian.cjs verify
docker compose exec app node bin/guardian.cjs pack install /packs/finance.pack
docker compose exec app node bin/guardian.cjs export pack /data/evidence.pdf
```

## Hardening notes

- **The engine publishes no port.** It is reachable only from `app` on the
  internal bridge. IP masquerading is disabled on that bridge.
- **`app` binds to loopback by default** (`BIND_ADDR=127.0.0.1`). Guardian OS has
  **no identity provider of its own** — put it behind the estate's reverse proxy
  and IdP before exposing it. See `docs/ACCREDITATION.md`, IA-2.
- **The engine runs read-only**, with `no-new-privileges` and all capabilities
  dropped.
- **No cloud credentials are set.** Under an air-gapped profile the store would
  refuse a cloud client anyway, but a deployment should not carry secrets it has
  no use for.
- **The systemd unit runs `guardian verify` after start but does not fail on
  it.** A governance service that refuses to start leaves an estate ungoverned,
  which is worse than starting with a reported problem — the failure is
  journalled loudly instead.

## Backup

The backup set is `guardian-data` (the `/data` volume), `trust/`, and
`policy-bundle/`. Stop the writer, copy, restart — the store is single-writer.
`decisions.jsonl` is append-only, so a copy taken while running truncates at a
line boundary and `verifyChain()` reports the truncation rather than accepting
it. Full procedure: `docs/SOVEREIGN.md` §13.
