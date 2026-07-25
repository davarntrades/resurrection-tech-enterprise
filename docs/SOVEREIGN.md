# Guardian OS Sovereign

**Phase 6 — deployment into disconnected, regulated and sovereign environments.**

Guardian OS Sovereign is not a different product, a fork, or a second codebase.
It is the same Guardian OS, on the same Runtime Governance kernel, with
different providers behind the same interfaces. Enterprise Provisioning,
Executive Command, the AI Twin, Executive Workspaces, Industry Intelligence
Packs and Managed Governance are unchanged. What changes is where state lives,
where policies come from, and what the deployment is permitted to talk to.

> **Honesty note.** Before this phase, "air-gapped deployment" was an
> architectural intention with no test and no documentation behind it. This
> document describes what is now implemented and CI-proven, and — in
> [Security assumptions](#10-security-assumptions) and
> [What is still not proven](#11-what-is-still-not-proven) — what is not. Read
> both halves before making a commitment to a customer.

---

## 1. Architecture

### 1.1 The one invariant

The Runtime Governance kernel is byte-for-byte identical in every profile.
Deny-by-default. Fail-closed. Dynamic policies are DENY-ONLY predicates that can
only ever ADD constraints. Nothing in this phase touches
`morrison_governance`, and nothing here can weaken a verdict.

### 1.2 Inversion of control

Two decisions were previously baked into the code path. Both are now providers
selected by a deployment profile, and cloud and local implementations satisfy
the same contract:

| Concern | Cloud provider | Sovereign provider | Contract |
|---|---|---|---|
| Ω policy source | `dynamic_rules._remote_rows()` — PostgREST over HTTPS | `policy_bundle.load()` — a signed filesystem bundle | a list of `{name, domain, spec, version, hash}` rows |
| Row + object state | Supabase (`lib/runtime/store.js`) | local JSON/JSONL + a local object directory | the same `store` API |

Because both providers return the same rows, `_refresh()` — compilation,
validation, caching, fail-closed retention, the ruleset fingerprint — is the
same code in every deployment. **The kernel does not know which provider fed
it, and cannot behave differently because of it.** That is what makes a
sovereign verdict comparable to a cloud verdict.

### 1.3 Where the selection happens

Provider selection is a **single point** in each language:

- `lib/sovereign/profiles.js` → `allowsCloudStore()`, `usesPolicyBundle()`,
  `requiresSignedBundles()`, `immutable()`
- `governance-service/dynamic_rules.py` → `provider()`

Both **refuse** rather than fall back. An unknown profile name throws; an
offline profile that finds `GOVERNANCE_POLICY_PROVIDER=remote` logs the refusal
and uses the bundle anyway. A sovereign operator who misspells a profile gets an
error, never an accidentally internet-connected deployment.

---

## 2. Deployment profiles

Set with `GUARDIAN_PROFILE`. Default is `cloud`, so every existing deployment is
unchanged.

| Profile | Storage | Evidence | Policies | Egress | Updates | Immutable |
|---|---|---|---|---|---|---|
| `cloud` | cloud | cloud | remote | allowed | continuous | no |
| `hybrid` | cloud | local | remote | allowed | continuous | no |
| `private_cloud` | cloud | cloud | remote | restricted | bundle | no |
| `on_prem` | local | local | bundle | restricted | bundle | no |
| `sovereign` | local | local | bundle | **denied** | signed bundle | **yes** |
| `air_gapped` | local | local | bundle | **denied** | signed bundle | **yes** |

```bash
guardian profile          # what this deployment is
guardian profile list     # every profile and what it configures
```

Under a local-storage profile the platform **refuses to construct a cloud
client even when `SUPABASE_*` credentials are present**. That is stronger than
"the credentials are unused": a box that inherits stale environment variables
from an image or a supervisor still never opens a socket, and the refusal is
logged and reported by `guardian verify`.

`GUARDIAN_IMMUTABLE=1` forces immutability on anywhere. It cannot be used to
turn it **off** where the profile mandates it.

---

## 3. The bundle format (`guardian.bundle/1`)

One format carries every offline artefact — policy bundles, Industry
Intelligence Packs, and update packages.

```
manifest.json     kind · id · version · created_at · entries[] · digest
manifest.sig      detached signature over the CANONICAL manifest bytes
<payload files>   each pinned by sha256 in the manifest
```

Two shapes, same bytes: a **directory** (human-inspectable, for
`guardian install ./policies/`) or a single **`.gos` file** (JSON with base64
payloads, for carrying one file on media). The `.gos` envelope avoids tar/gzip
so unpacking needs nothing but the standard library, on any OS, indefinitely.

### 3.1 Three independent verification layers

All three must pass, in both languages:

1. **Content** — every entry's bytes hash to the sha256 in the manifest.
2. **Entry list** — the manifest `digest` equals the recomputed digest of the
   entry list, so entries cannot be added or removed. A file dropped into a
   bundle directory is reported as an *unlisted file*, not silently installed.
3. **Signature** — the detached signature verifies against a key in the local
   trust store, so the manifest itself cannot be rewritten.

Signatures cover **canonical** bytes (sorted keys, no insignificant
whitespace), so two independently-built copies of the same bundle sign
identically. `scripts/sovereign/crosslang.test.cjs` proves the Node and Python
canonicalisers agree byte-for-byte — if that ever drifts, every signature
silently stops verifying, so it is a CI gate.

### 3.2 Signature algorithms

| Algorithm | Property | Use |
|---|---|---|
| `ed25519` (default) | asymmetric — the **private key never has to exist inside the sovereign environment**, only the 32-byte public key | production |
| `hmac-sha256` | symmetric — a pre-shared secret; anyone who can verify can also forge | operators who prefer a shared secret |
| `none` | integrity only | development; **refused** under `sovereign` / `air_gapped` |

The engine verifies Ed25519 with `governance-service/ed25519_verify.py` — the
RFC 8032 verification routine implemented over `int` arithmetic and `hashlib`.
That keeps the air-gapped runtime dependency-free: no `cryptography`, no wheels
to vendor, no ABI to match. It is verify-only by design; a sovereign runtime
never needs a private key, and not having signing code in the codebase is a
supply-chain property worth keeping.

---

## 4. Offline policy loading

### 4.1 Authoring and publishing (connected, at the publisher)

```bash
# once: create a signing identity. The .pem stays with the publisher.
guardian keygen --key-id acme-release --out ./keys

mkdir -p src/policies
cat > src/policies/acme_wire_cap.json <<'JSON'
{ "name": "acme_wire_cap", "domain": "finance", "status": "active", "version": 1,
  "spec": { "match": { "tools": ["wire_transfer"] },
            "conditions": { "threshold": { "field": "amount", "op": ">", "value": 50000 } },
            "severity": "critical",
            "description": "Wire transfers above 50,000 require an approved exception." } }
JSON

guardian bundle policies ./src \
  --id acme-policies --version 1.0.0 \
  --out acme-policies-1.0.0.gos \
  --sign-key ./keys/acme-release.pem --key-id acme-release
```

`name` and `domain` are written once at the top level of each document;
`policy_rows()` folds them into the spec exactly as `govpolicy.draft` does for
the database provider, so a policy that compiles from the control plane compiles
identically from a bundle.

`guardian bundle` **refuses to build an unsigned bundle** unless you pass
`--unsigned`.

### 4.2 Installing (disconnected, at the estate)

```bash
export GUARDIAN_PROFILE=air_gapped
export GUARDIAN_TRUST_DIR=/etc/guardian/trust
export GUARDIAN_POLICY_BUNDLE=/var/lib/guardian/policy-bundle

cp acme-release.pub $GUARDIAN_TRUST_DIR/          # once, out of band
guardian verify ./acme-policies-1.0.0.gos         # before trusting the media
guardian install ./acme-policies-1.0.0.gos
systemctl restart guardian-engine
```

The engine then reads policies from disk:

```json
{ "provider": "bundle", "profile": "air_gapped", "active": 1,
  "bundle": { "ok": true, "signed": true, "alg": "ed25519",
              "key_id": "acme-release", "policies": 1,
              "require_signed": true, "hot_reload": false, "errors": [] } }
```

This block is served on the engine's own `/health` under `dynamic_policies`, so
an operator can read enforcement state off the engine rather than taking the
deployment's word for it.

### 4.3 Baking a bundle into the image

```bash
docker build -f governance-service/Dockerfile \
  --build-arg POLICY_BUNDLE=dist/policy-bundle \
  --build-arg TRUST_BUNDLE=dist/trust \
  -t guardian-engine:acme-1.0.0 .

docker run --network none -e GUARDIAN_PROFILE=air_gapped guardian-engine:acme-1.0.0
```

A baked bundle lands at `/app/policy-bundle` with its trust store at
`/app/trust`; both are picked up automatically **only if they exist**, so a
cloud image — which bakes neither — is completely unaffected. **Baking is a
delivery convenience, never a reason to skip verification**: the bundle is
verified at runtime on every load, not just at build time.

### 4.4 Fail-closed behaviour

A bundle that fails **any** layer yields **zero** policies — never "the ones we
could parse". Because dynamic policies are deny-only, dropping them removes
constraints rather than granting allows, so the static `DEPLOYMENT_RULES`
baseline still governs every request. But an operator must never be left
believing an unverifiable bundle is enforcing, so:

- the rejection is logged with every reason;
- `dynamic_rules.status().bundle.ok` is `false` with the error list;
- `guardian verify` **fails** the deployment.

Hot reload is **off by default**: the ruleset a box boots with is the ruleset it
enforces until it is deliberately updated and restarted. Set
`GUARDIAN_POLICY_HOT_RELOAD=1` to re-read a mounted bundle in place.

---

## 5. Offline Intelligence Packs

```bash
guardian pack list                                        # what this build carries
guardian sovereign                                        # what this deployment may host
guardian pack export --all --out ./dist --sign-key key.pem
guardian pack install ./dist/finance.pack                 # air-gapped
guardian pack uninstall finance                           # rolls its policies back
```

> **Phase 7.** Sovereign Intelligence Packs — national security, defence
> operations, critical infrastructure, public sector, national healthcare,
> research and development, and cyber operations — install through exactly this
> path, and additionally declare the deployment guarantees their classification
> requires. Because they are declarative *end to end*, they round-trip through a
> signed bundle with **no** loss of fidelity: §5.1 below describes the
> Industry-pack case where projection code stays behind, which does not apply to
> them. See `docs/SOVEREIGN-INTELLIGENCE-PACKS.md`.

### 5.1 Data travels; code does not

A pack's Ω policies, templates, evidence mappings, incident workflows and
regulations are declarative and serialise exactly. Its
`metrics/dashboard/recommendations` are JavaScript and deliberately do **not**.
Guardian OS has never executed code that arrived as content — not from the
database, and not from a USB stick — and a signed bundle is not the exception.

So a pack installs in one of two modes, reported honestly rather than papered
over:

| Mode | When | Behaviour |
|---|---|---|
| `builtin` | the pack's code ships in this image (the eight shipped packs) | identical to a cloud install, bespoke projections and all |
| `generic` | the pack's code is not in this image (a later release, or a customer-authored pack) | **policies install and enforce**; the dashboard renders through the shared declarative projection, and the missing bespoke analytics appear as an explicit not-instrumented note |

**Enforcement is identical in both modes** — the Ω policies are the part that
actually governs. Only presentation differs, and `guardian verify` says which
mode each installed pack is running in.

### 5.2 Installation is the same governed lifecycle

Bundle verification happens first. Only then does the immutable-runtime window
open, and only for the duration of the install. Everything after that point is
`draft → validate → activate` through `govpolicy`, scoped to the enterprise,
evidence-backed and reversible. **A bundle is a delivery mechanism, not a
bypass** — an offline install produces the same evidence as a cloud one.

The verified declarative content is stored on the install row, so a
disconnected box survives a restart with the media absent.

---

## 6. Local evidence and the local twin

Under a local-storage profile everything lands on disk in `RUNTIME_DATA_DIR`:

```
$RUNTIME_DATA_DIR/
  orgs.json  environments.json  governance_policies.json
  ops_evidence.json  industry_packs.json  sovereign_updates.json  …
  decisions.jsonl          ← append-only, hash-chained runtime evidence
  deliverables/            ← reports, exports, evidence packs
```

`decisions.jsonl` carries the tamper-evident hash chain
(`prev_hash → entry_hash` per environment). `store.verifyChain()` recomputes it
and reports the first broken sequence — the same guarantee locally as in the
cloud.

The AI Twin, Executive Workspaces (all eight roles), Managed Governance
monitoring, drift detection, health scoring, briefings and evidence packs all
derive from this local state with **no cloud dependency**. The boot proof
asserts this under every profile.

```bash
guardian export evidence /media/audit-2026-07     # copy the whole store off the box
```

Platform health reports the local store as a **deployment target** under a
sovereign profile rather than as a dev fallback — with the real single-writer
caveat, not a misleading "configure Supabase" hint.

---

## 7. Offline update packages

```bash
guardian update ./guardian-1.4.0.gos --dry-run    # describe, change nothing
guardian update ./guardian-1.4.0.gos
guardian update history
guardian update rollback sov_ab12cd34…
```

An update bundle may carry `policies/*.json`, `packs/*.json`,
`migrations/*.sql` and `notes.md`. Three properties this design insists on:

1. **Verified before anything happens.** Signature and every content hash are
   checked first.
2. **A rollback plan is captured BEFORE the first change** — every policy the
   update will supersede and every pack it will install are recorded first. An
   update that cannot be described in reverse is not applied.
3. **Migrations are never auto-executed.** Guardian OS does not run DDL that
   arrived inside a file on removable media, however well signed. Migrations are
   surfaced with their hashes for a DBA to apply deliberately. On a local-store
   deployment there is no schema to migrate and the section is informational.

Partial application is recorded, not hidden: if one item fails, the update lands
as `partial` with the per-item outcome, and the rollback plan still covers
everything that did change. Rollback keeps the history row — evidence, not
erasure.

---

## 8. Immutable runtime

Under `sovereign` and `air_gapped` (or with `GUARDIAN_IMMUTABLE=1`), governed
configuration is locked: policy authoring, policy activation and pack
installation are refused. The lock is **not a boolean a caller can pass** —
`assertMutable()` fails unless execution is inside `withVerifiedBundle()`, and
the only callers of that are install paths that have already verified a
signature. A route handler cannot claim to be an update; it has to be one.

**Rollback is deliberately not locked.** Immutability exists to stop silent
drift and unsigned *additions*; it must never take away an operator's ability to
*stop* enforcement. A sovereign estate where a mis-scoped policy is blocking
clinical or emergency work, and nobody can disable it without a signing
ceremony, is a worse failure than the drift immutability prevents. Under a
locked runtime the brake is recorded **extra loudly** —
`gov_policy_rollback_under_immutable_runtime` plus an event — rather than
removed. This is a deliberate trade-off; see
[Security assumptions](#10-security-assumptions).

---

## 9. Verification

```bash
guardian verify                    # the deployment
guardian verify ./some-bundle.gos  # one artefact, no platform needed
```

Eight checks, each `pass` / `warn` / `fail` with a reason:

| Check | Fails when |
|---|---|
| Deployment profile | `GUARDIAN_PROFILE` does not resolve |
| Network posture | a local-storage profile has a cloud client; warns if unused cloud credentials are present |
| Ω policy integrity | no bundle configured, unreadable, or verification failed |
| Signing trust store | signatures are required and the trust store is empty |
| Industry pack provenance | packs cannot be read; warns for `generic`-mode packs |
| Evidence store | the evidence directory is not writable |
| Ω engine | the engine is unreachable (Guardian OS is fail-closed — governed actions are blocked) |
| Governance readiness | active policies cannot be read |

**Diagnostic, never corrective.** Verification reads; it never activates,
installs, migrates or "fixes" anything, so it is safe on a live system in front
of an auditor. Anything unknown is reported as unknown — never assumed to pass.

The same report is available at `GET /api/ops/sovereign?view=verify`. That route
is **read-only by design**: installing bundles and applying updates happen at
the console where the media physically is. An air-gapped estate's supply chain
should not have a network-reachable write path.

---

## 10. Security assumptions

Stated plainly, because a procurement team will ask.

1. **The trust store is the root of trust.** Anyone who can write to
   `GUARDIAN_TRUST_DIR` can install anything. Provision public keys out of band,
   mount the directory read-only, and treat write access to it as equivalent to
   root.
2. **Ed25519 is verify-only in the engine.** The private key never needs to
   exist inside the sovereign environment. If you use `hmac-sha256` instead, the
   verifier can also forge — a weaker supply-chain property, chosen knowingly.
3. **`ed25519_verify.py` is not constant-time.** It operates purely on public
   values (public key, message, signature), so timing carries no secret. Do not
   repurpose it for anything involving a private key.
4. **Baking a bundle into an image does not replace verification.** The bundle
   is verified on every load. An image is not a trust boundary.
5. **The local store is single-writer.** JSON/JSONL files are not
   concurrency-safe across processes. Run one writer per data directory. This is
   a real limitation, reported by health rather than glossed over.
6. **Migrations are not executed.** Signed DDL is still DDL from removable
   media. A human applies it.
7. **Rollback is available under immutability.** Deliberate (§8). If your threat
   model requires that enforcement cannot be stopped locally, you need a
   physical or procedural control — the software will not provide it, and
   pretending otherwise would be worse.
8. **The agent is never trusted.** Unchanged from every other phase: the LLM
   proposes, the engine decides, a human approves privileged actions. Nothing in
   this phase gives the agent a new capability.
9. **Fail-closed means blocked, not degraded.** If the engine is unreachable,
   governed actions are BLOCKED. An air-gapped deployment must run the engine
   locally; there is no "offline allow" mode and there will not be one.

---

## 11. What is still not proven

Honesty about the edges. Two items from the previous release have since been
closed; the rest have not, and are stated as they are.

**Closed since Phase 6.0:**

- ~~The web tier is not offline-clean.~~ **Done.** `npm run build:sovereign`
  emits an interface with no Google Fonts, no Vercel Analytics, no Speed
  Insights and no Calendly. `npm run sovereign:offline-audit` scans the emitted
  HTML, JS and CSS: the cloud build shows 170+ external resource loads, the
  sovereign build shows **zero**. The audit has a baseline mode that asserts it
  can still detect, so a pass cannot be vacuous, and CI additionally serves the
  build inside a network namespace and greps the delivered HTML.
- ~~PDF rendering needs Chromium.~~ **Done.** `lib/sovereign/pdf.js` writes
  PDF 1.4 bytes from Node's standard library alone — real core-font metrics,
  measured line breaking, a verified xref table. Evidence packs, deployment
  attestations and the control mapping all render offline. The sovereign app
  image installs no browser.

**Still open — and these are the honest limits:**

- **No reference deployment has run on customer hardware.** The artefacts exist
  (`deploy/sovereign/`: compose topology, hardened images, media builder,
  offline installer, systemd unit) and the media builder proves the engine image
  governs with `--network none` before it ships. But CI is not a datacentre.
  Until [`docs/FIELD-TRIAL.md`](./FIELD-TRIAL.md) has been executed and a record
  countersigned, the correct description is **acceptance-testable, not
  field-tested**. `guardian acceptance` marks any run without a site and a
  witness as a self-test on the face of the document, so this cannot be blurred
  by accident.
- **No accreditation has been sought or obtained.** No Common Criteria
  evaluation, no NCSC assurance, no FedRAMP authorisation, no ATO, no CE
  marking. `guardian controls` publishes the control mapping **and the gap
  register**; see [`docs/ACCREDITATION.md`](./ACCREDITATION.md) for the ten open
  gaps and what a real accreditation route would require. The largest are: no
  identity provider of our own (IA-2 is inherited), tamper-evidence rather than
  cryptographic non-repudiation (AU-10), and a non-FIPS-validated verifier
  (SC-13).
- **No independent security assessment.** No penetration test of this codebase
  has been commissioned (NCSC P7).
- **No tested RTO/RPO.** The backup set and restore procedure are documented and
  end in `guardian verify`, but continuity targets have not been measured on
  representative hardware.

## 12. CI

`.github/workflows/sovereign.yml` runs on every change to the sovereign path.

| Job | What it proves |
|---|---|
| `platform (cloud / on_prem / air_gapped)` | Guardian OS boots and governs under each profile; storage, immutability and verification match what the profile promises |
| `air-gapped platform` | the full suite + boot proof inside `unshare -n` — **a network namespace with no interface but loopback**. The job first asserts the namespace really has no egress, so it cannot silently pass |
| `air-gapped engine` | a signed bundle is published, baked into an image, and the container is run with `--network none`: the engine loads the bundle, verifies the Ed25519 signature, and enforces. A second image with a **tampered** bundle must load **zero** rules |
| `offline-clean interface` | a cloud build must show external hosts (proving the scanner works), the sovereign build must show none, and the built app is then served inside a network namespace and its delivered HTML grepped for font/telemetry hosts |

Cloud credentials are deliberately left in the environment in the air-gapped
jobs: the platform must **refuse** them, not merely fail to reach them.

Local commands:

```bash
npm run sovereign:test        # the full sovereign suite
npm run sovereign:profiles    # boot proof, all six profiles
npm run sovereign:pdf         # offline PDF rendering, no Chromium
npm run sovereign:acceptance  # the site acceptance instrument + assurance artefacts
npm run sovereign:crosslang   # Node signs → Python verifies (needs ENGINE_PATH)
npm run sovereign:ci          # all of the above

npm run build:sovereign             # offline-clean interface build
npm run sovereign:offline-audit     # prove it makes no external request
```

Operator commands added in this phase:

```bash
guardian export pack [FILE.pdf]     # evidence pack → auditor-ready PDF, offline
guardian acceptance --pdf F         # site acceptance suite, on THIS hardware
guardian controls [gaps] --pdf F    # control mapping + gap register
guardian verify --pdf F             # deployment attestation
```

---

## 13. Backup and disaster recovery

**What to back up** (local-storage profiles):

| Path | Contents | Recovery consequence if lost |
|---|---|---|
| `$RUNTIME_DATA_DIR` | all governed state + `decisions.jsonl` + `deliverables/` | the estate's entire evidence history |
| `$GUARDIAN_TRUST_DIR` | public signing keys | cannot install or update until re-provisioned out of band |
| `$GUARDIAN_POLICY_BUNDLE` | the active signed policy bundle | re-installable from the original media |
| the engine image reference | the pinned `ENGINE_REF` | verdicts stop being reproducible |

**Procedure.** Stop the writer (the store is single-writer), copy
`$RUNTIME_DATA_DIR` — or use `guardian export evidence <OUT>` — and restart.
`decisions.jsonl` is append-only; a partial copy taken while running will be
truncated at a line boundary, and `store.verifyChain()` reports the truncation
rather than accepting it silently.

**Restore.** Restore `$RUNTIME_DATA_DIR`, re-provision the trust store,
re-install the policy bundle, restart the engine, then:

```bash
guardian verify
```

A restore is not complete until verification passes.

**Reproducibility.** Given the pinned engine ref, the same policy bundle and the
same trajectory, verdicts are deterministic — the engine's attestation
fingerprints the exact ruleset (static + dynamic). Keep the bundle alongside the
backup so a historical decision can be re-derived, not just read.

---

## 14. File map

| Path | Role |
|---|---|
| `lib/sovereign/profiles.js` | the six deployment profiles + capability predicates |
| `lib/sovereign/bundle.js` | the `guardian.bundle/1` format — build, sign, verify, read |
| `lib/sovereign/packs.js` | offline pack export + declarative (`generic`) projections |
| `lib/sovereign/updates.js` | signed update packages, rollback plans, history |
| `lib/sovereign/immutable.js` | the locked-runtime guard |
| `lib/sovereign/verify.js` | the eight deployment checks |
| `lib/sovereign/pdf.js` | PDF 1.4 bytes from Node stdlib alone — no Chromium |
| `lib/sovereign/report.js` | the shared section vocabulary, laid out on paper |
| `lib/sovereign/controls.js` | control mapping + gap register (a self-assessment) |
| `lib/sovereign/acceptance.js` | the site acceptance suite that runs on the target |
| `lib/sovereign/build.ts` | build-time switches for the offline-clean interface |
| `deploy/sovereign/` | reference deployment: compose, images, media builder, installer |
| `docs/ACCREDITATION.md` | accreditation posture and the open gaps |
| `docs/FIELD-TRIAL.md` | the protocol that turns acceptance-testable into field-tested |
| `bin/guardian.cjs` | the operator CLI |
| `governance-service/policy_bundle.py` | the engine's filesystem policy provider |
| `governance-service/ed25519_verify.py` | pure-stdlib RFC 8032 verification |
| `governance-service/dynamic_rules.py` | provider selection (`remote` / `bundle` / `off`) |
| `app/api/ops/sovereign/route.ts` | read-only posture + verification over HTTP |
| `scripts/sovereign/*.test.cjs` | platform suite, per-profile boot proof, cross-language proof |
| `.github/workflows/sovereign.yml` | the CI that makes "air-gapped" a test result |
