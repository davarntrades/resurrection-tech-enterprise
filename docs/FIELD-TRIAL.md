# Guardian OS Sovereign — field trial protocol

**Status today: acceptance-testable, not field-tested.**

Guardian OS Sovereign has been proven in CI — inside a network namespace with no
interface but loopback, and in a container started with `--network none`. That
is a real proof of the software's behaviour. It is **not** a proof that an
installation works on a customer's hardware, on a customer's isolated network,
under a customer's operational procedures. Nothing in this repository should be
described as field-tested until this protocol has been executed and a record
countersigned.

This document is the protocol. `guardian acceptance` is the instrument.

---

## 1. What "field-tested" has to mean

A trial counts when all four are true. Fewer than four is a demonstration, and
should be called one.

1. **Real hardware** — the customer's own hosts, not a laptop and not a VM on a
   connected network.
2. **Real isolation** — physically or logically severed from the internet, in
   the state the system will actually run in.
3. **A witness** — someone other than the person running the commands, named on
   the record.
4. **A retained artefact** — the signed acceptance record, kept by the customer,
   with failures recorded rather than re-run away.

`guardian acceptance` enforces (3) and (4) structurally: a run with **no site
and no witness recorded is marked a self-test on its face**, and the generated
PDF says so. You cannot accidentally produce something that reads like a field
trial.

---

## 2. Before the trial

**On a connected build host (the vendor or the customer's build team):**

```bash
guardian keygen --key-id <release-key> --out ./keys      # private key stays here
deploy/sovereign/build-media.sh \
  --key ./keys/<release-key>.pem --key-id <release-key> \
  --version <x.y.z> --policies ./their-policies --out ./media
```

The media builder proves the engine image governs with `--network none` **before
the media ships**. The private signing key is never copied onto the media.

**Carry to site:** the media directory, on write-once media if the estate's
procedures require it.

**Prerequisites on the target:** a container runtime, `openssl`, and enough disk
for the images and the evidence store. Nothing else. No package installs, no
registry access, no Chromium.

---

## 3. The trial

### Step 1 — verify the media before trusting it

```bash
cd /media/guardian && sha256sum -c MANIFEST.txt
```

Record the result. **If this fails, stop.** Do not install and do not "try the
other copy" without recording why the first failed.

### Step 2 — install

```bash
sudo deploy/install.sh
cd /opt/guardian && docker compose up -d
```

The installer refuses to proceed without a manifest, generates the deployment's
secrets **on the estate** (they never travel on media), and loads images from
the media only.

### Step 3 — prove the isolation is real

Before claiming an air gap, demonstrate it. Record the actual output:

```bash
ip route                                    # no default route, or a black hole
getent hosts registry.npmjs.org || echo "DNS: no resolution (expected)"
timeout 5 curl -sS https://registry.npmjs.org/ || echo "HTTPS: no egress (expected)"
docker compose exec app sh -c 'timeout 5 wget -q -O- https://example.com || echo "container: no egress (expected)"'
```

A trial that does not evidence its own isolation proves nothing about isolation.

### Step 4 — run acceptance, witnessed

```bash
docker compose exec app node bin/guardian.cjs acceptance \
  --site "<building, room, rack>" \
  --operator "<name, role>" \
  --witness "<name, role>" \
  --classification "<marking, if any>" \
  --pdf /data/acceptance-record.pdf
```

The suite provisions a throwaway enterprise, installs a policy, sends a real
unauthorised action through the live engine, checks the decision was blocked,
verifies the audit hash chain, renders an evidence pack to PDF with no browser,
confirms the evidence is exportable, and removes the throwaway enterprise. Every
step is timed on that hardware.

### Step 5 — verify and attest

```bash
docker compose exec app node bin/guardian.cjs verify \
  --site "<site>" --operator "<name>" --pdf /data/attestation.pdf
docker compose exec app node bin/guardian.cjs controls --pdf /data/control-mapping.pdf
```

### Step 6 — retrieve and retain

```bash
docker compose exec app node bin/guardian.cjs export evidence /data/export
docker compose cp app:/data/acceptance-record.pdf ./
docker compose cp app:/data/attestation.pdf ./
```

Countersign the acceptance record. **Retain it including any failures.** A trial
record with no failures and no warnings on first run is unusual; if that is what
you have, say why.

---

## 4. What to measure

The acceptance record captures these automatically. Compare against the
customer's own requirement, not against a vendor benchmark:

| Measure | Where it comes from | Why it matters |
|---|---|---|
| Governance decision latency | the `enforce` step, measured on that host | the per-action cost the estate will actually pay |
| Provisioning time | the `provision` step | first-day experience on their hardware |
| Evidence pack render time | the `render` step | whether monthly reporting is practical offline |
| Chain verification | the `chain` step | audit integrity on their storage |
| Host profile | CPU count, memory, platform, arch | so a result can be compared to another site |

Run acceptance at least twice: once immediately after install, and once after a
period of real operation. The second run is the one that tells you whether the
evidence store, the chain and the render times hold up under accumulated data.

---

## 5. What a trial does NOT establish

Say these out loud at the debrief, before someone assumes otherwise:

- **It is not an accreditation.** See [`docs/ACCREDITATION.md`](./ACCREDITATION.md).
- **It is not a penetration test.** No adversarial assessment of the codebase has
  been commissioned.
- **It does not validate the customer's models.** Guardian OS governs the actions
  of AI systems; it makes no claim about the systems themselves.
- **It does not establish RTO/RPO.** Backup and restore should be exercised
  separately, ending in `guardian verify`, and timed.
- **One site is one data point.** Two sites on different hardware is the minimum
  before "field-tested" is a fair description in a public claim.

---

## 6. Reporting a trial honestly

When a trial is complete, the claim that can be made is bounded by what was
done. Suggested wording, in increasing strength:

| What happened | What you may say |
|---|---|
| CI only | "Air-gapped operation is proven in CI with egress removed." |
| A self-test run on a laptop | "Acceptance-testable; a self-test record is available." |
| One witnessed trial, one site | "Field-tested at one customer site; the acceptance record is available under NDA." |
| Two or more sites, different hardware | "Field-tested across multiple customer environments." |

Do not compress a rung. A defence or government procurement team will ask for
the record, and the record says exactly which rung you are on.

---

## 7. Trial log

Keep this table in the customer's own copy of the document. It is deliberately
empty here — this repository has no completed trials to report.

| Date | Site | Hardware | Profile | Operator | Witness | Result | Record |
|---|---|---|---|---|---|---|---|
| _(none yet)_ | | | | | | | |
