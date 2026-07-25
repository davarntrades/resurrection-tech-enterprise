# Sovereign Intelligence Packs

**Phase 7 — specialised intelligence for organisations whose mission, regulation
or operating environment requires sovereign AI.**

Sovereign Intelligence Packs are **not** sovereign editions of the Industry
Intelligence Packs. They are different domains — national security, defence
operations, critical national infrastructure, sovereign public administration,
national healthcare, sovereign research, and national cyber operations —
installed onto the same Guardian OS, the same Runtime Governance kernel and the
same governed Digital Twin.

There is no sovereign edition, no sovereign fork, and no separate codebase.

```
Guardian OS
  ↓
Runtime Governance Kernel        never forked, never duplicated
  ↓
Deployment Profile               cloud / hybrid / private / on-prem / sovereign / air-gapped
  ↓
Installed Intelligence Packs     Industry for a sector · Sovereign for a national mission
  ↓
Governed Enterprise
```

**Deployment and domain expertise are separate concerns.** Where Guardian OS
runs is a deployment profile (Phase 6, `docs/SOVEREIGN.md`). What it knows is an
Intelligence Pack. Keeping them separate is what lets a defence organisation and
a retail bank run the same governance kernel, receive the same fixes, and still
operate under entirely different domain intelligence and entirely different
infrastructure guarantees.

> **Honesty note.** This document describes what is implemented and CI-proven
> (`npm run sovereign:packs`), and says plainly which measures are *not*
> instrumented and why. Read
> [§9 Security assumptions](#9-security-assumptions) and
> [§10 What is not claimed](#10-what-is-not-claimed) before making a commitment
> to a customer.

---

## 1. The catalog

Seven sovereign domains ship in this release. Every figure below is read from
the production registry (`lib/ops/packs/sovereign/`).

| Pack | Mission domain | Classification | Eligible deployment profiles |
|---|---|---|---|
| **National Security Pack** | National security | Secret | sovereign, air-gapped |
| **Defence Operations Pack** | Defence operations | Secret | sovereign, air-gapped |
| **Cyber Operations Pack** | National cyber operations | Secret | sovereign, air-gapped |
| **Critical Infrastructure Pack** | Energy, utilities, telecoms, transport, water | Official — Sensitive | hybrid, on-prem, sovereign, air-gapped |
| **Public Sector Pack** | Government and public administration | Official — Sensitive | hybrid, on-prem, sovereign, air-gapped |
| **National Healthcare Pack** | National healthcare | Official — Sensitive | hybrid, on-prem, sovereign, air-gapped |
| **Research & Development Pack** | Sovereign research and development | Official — Sensitive | hybrid, on-prem, sovereign, air-gapped |

Two of these overlap in name with Industry Packs that already shipped. The
distinction is deliberate and matters commercially:

| | Industry Pack | Sovereign Pack |
|---|---|---|
| **Government** | A public-sector body on any deployment profile. | **Public Sector Pack** — a department of state whose data residency, supply chain and accountability obligations require the platform itself to be sovereign. |
| **Healthcare** | A single provider on any deployment profile. | **National Healthcare Pack** — a national health system: many trusts and boards under one accountability structure, with population data whose residency is non-negotiable. |
| **Cybersecurity** | An enterprise security function. | **Cyber Operations Pack** — a national cyber authority, where an action can affect infrastructure *outside* the organisation and must be held behind named legal and operational authority. |

An organisation can install both families. They are additive and independent.

---

## 2. What a Sovereign Intelligence Pack contains

A sovereign pack satisfies the ordinary Intelligence Pack contract — identity,
regulations, deny-only Ω policies, templates, evidence mappings, incident
workflows — **plus** a `sovereign` block carrying what a national operator
actually needs:

| Field | What it declares |
|---|---|
| `classification` | The handling bar the deployment must meet. Gates installation (§4). |
| `mission_domain`, `mission` | The sovereign domain and its one-line mandate. |
| `authority_chains[]` | Who may authorise which action, who they delegate to, and the evidence each decision leaves. |
| `workflows[]` | Governed mission workflows, stage by stage, each with the gate that must be satisfied. |
| `capabilities[]` | The governed capabilities, named against the Ω policies that constrain them. |
| `readiness[]` | Operational readiness measures, each bound to a **grounded source** (§7). |
| `risk_models[]` | Domain risk factors and their escalation conditions. |
| `twin_projections[]` | Which parts of the **one** governed twin carry mission meaning. |
| `briefings[]`, `reports[]` | The executive reporting the domain's accountability structure requires. |

### 2.1 A pack contains no executable code

This is the load-bearing property of Phase 7, and it is structural rather than a
review convention.

Every file in `lib/ops/packs/sovereign/` is a JavaScript object of arrays and
strings. On load, `assertDeclarative()` walks the entire object graph and
**refuses any pack containing a function anywhere in it** — six levels deep
inside a workflow stage is still code, and is still refused.

The metrics, dashboards and recommendations a sovereign pack renders are
produced by platform code (`lib/ops/packs/sovereign/projections.js`), shared by
all seven packs.

Three consequences, in the order a buyer cares about them:

1. **A sovereign pack cannot introduce executable behaviour into a national
   deployment**, because there is no field in which behaviour could hide.
2. **A sovereign pack survives a signed bundle round-trip with no loss.** An
   Industry Pack's bespoke projections are code, so they cannot travel on media
   and a bundle-installed one falls back to generic rendering. A sovereign pack
   is data end to end, so the copy that arrives on media in a disconnected
   facility renders *identically* to the copy in the image. Its projection mode
   is always `sovereign`, never `generic`.
3. **A domain authority can review a pack without reading code.** The legal
   adviser, safety authority, Caldicott guardian or accounting officer
   accountable for the mission can review exactly what will be enforced, in
   their own language. The Control Room renders the whole pack for inspection
   *before* installation.

---

## 3. What does not change

| Invariant | How it holds |
|---|---|
| **One kernel** | Sovereign packs add Ω policies **within the kernel's existing domain vocabulary**. Phase 7 adds no domain, no condition kind, no evaluation path, and no privileged escape. A pack naming a domain the kernel does not define is refused at load. |
| **One Digital Twin** | `twin_projections` declare which parts of the existing twin carry mission meaning. No pack builds a second twin or a parallel data model. |
| **One workspace system** | A sovereign lens is an additional Executive Workspace perspective, projected from the same shared context. It shows the same governance score as the CEO workspace, because it is the same twin. |
| **Deny-only** | A pack may add constraints. It cannot weaken a baseline, grant permission, or create capability. Condition types are restricted to `unauthorized_unless`, `flag_true_blocks` and `threshold`. |
| **One renderer** | Sovereign dashboards are built from the shared section vocabulary (`lib/ops/sections.js`). There is no sovereign-specific renderer anywhere in the Control Room. |
| **Reversible** | Uninstalling rolls the pack's policies back and returns the enterprise to its exact prior governed baseline. |
| **One installer** | Sovereign and Industry packs share one registry and one install path. There is no sovereign-specific install code, because there is no sovereign-specific platform. |

---

## 4. Admissibility — may this pack run *here*?

`lib/ops/sovereignty.js` is the only governance concept Phase 7 adds to the
platform, and it answers exactly one question:

> May **this pack** be installed on **this deployment**?

### 4.1 Derived, not declared

A classification tier does **not** name the deployment profiles it trusts. It
declares the **guarantees it requires**, and the eligible profiles are derived
from `lib/sovereign/profiles.js`:

| Guarantee | Means |
|---|---|
| `no_telemetry` | The deployment reports no product or usage telemetry to the vendor. |
| `local_state` | Enterprise state is persisted on infrastructure the organisation controls. |
| `local_evidence` | Evidence, reports and exports never leave the organisation's infrastructure. |
| `signed_bundles` | Policies, packs and updates are accepted only as verified signed bundles. |
| `egress_denied` | The deployment is not permitted to open outbound connections. |
| `immutable_runtime` | Policies, packs and runtime configuration are locked; only signed updates change them. |
| `no_network` | The platform refuses to construct a cloud client even when credentials are present. |

| Tier | Requires | Derived eligible profiles |
|---|---|---|
| **Official** | no telemetry | hybrid, private cloud, on-prem, sovereign, air-gapped |
| **Official — Sensitive** | + local evidence | hybrid, on-prem, sovereign, air-gapped |
| **Secret** | + local state, signed bundles, egress denied, immutable runtime | sovereign, air-gapped |
| **Top Secret** | + no network | air-gapped |

Add a deployment profile tomorrow and admissibility recomputes with no edit to
the sovereignty module. Weaken a profile's guarantees and the packs that
depended on them stop being eligible — automatically, and loudly.

The tiers are deliberately **jurisdiction-neutral**. An organisation maps its
own scheme (UK OFFICIAL/SECRET, US CUI/CONFIDENTIAL, NATO, EU RESTREINT, or a
regulator's operational-resilience tier) onto these during assessment.

### 4.2 Fail-closed, and refusals explain themselves

An unknown classification is a hard error, never a silent downgrade to the most
permissive tier. A pack that cannot be assessed cannot be installed.

The gate runs in `industry.install()` **before any policy is drafted**, so a
refusal leaves the enterprise byte-for-byte untouched — nothing half-installs
and is then rejected. And the refusal names the specific missing guarantee:

```
National Security Pack requires a Secret deployment and this is Cloud.
Cloud does not provide "State held in the estate" — enterprise state is
persisted on infrastructure the organisation controls. […]
Eligible deployment profiles: sovereign, air_gapped.
```

### 4.3 Sovereignty drift

If a deployment profile is changed *after* a pack is installed so that it no
longer meets the pack's bar, that surfaces as a **critical** recommendation
through Managed Governance, and in `industry.summary()` under
`sovereign.inadmissible`. It is the most serious finding a sovereign pack can
make about its own installation.

### 4.4 Admissibility is not enforcement

Admissibility gates **installation**. It is a supply-chain control, not a
runtime one, and nothing in it can permit an action the kernel would refuse.
Once installed, a sovereign pack's Ω policies are ordinary deny-only policies
evaluated by the same unchanged engine.

---

## 5. Installation

### 5.1 On a sovereign or air-gapped deployment: signed media only

Sovereign and air-gapped profiles run an **immutable runtime**. Pack
installation is locked, so it cannot be performed from the Control Room, an API
route, or an agent. A pack arrives on signed media, verified at the console:

```bash
# at the publisher (connected)
guardian pack export national-security --sign-key key.pem --out ./media

# at the estate (disconnected)
guardian pack install ./media/national-security.pack --org ORG_ID
```

The bundle's signature and content hashes are verified **before** anything is
installed. Only then is the immutable-runtime window opened, and only for the
duration of that install. Everything after that point is the ordinary governed
lifecycle — draft → validate → activate through `govpolicy` — so an offline
install produces exactly the same evidence as a connected one.

This is deliberate: an air-gapped estate's supply chain must not have a
network-reachable write path into governed configuration.

### 5.2 On a mutable deployment

Where the runtime is not immutable, the existing operator route installs any
pack, sovereign ones included, through the same governed lifecycle — and the
admissibility gate still refuses one the deployment cannot host.

### 5.3 Never auto-suggested

Enterprise Provisioning suggests an **Industry** pack from the organisation's
industry string. It never auto-suggests a sovereign pack, because installing one
asserts something about the *deployment*, not just the sector. Sovereign
selection is an explicit, assessed decision.

---

## 6. Where it appears

| Surface | What it shows |
|---|---|
| **Control Room → Sovereign packs** | Deployment posture (guarantee by guarantee), the catalog with live admissibility, classification tiers, full pack inspection before install, and the live dashboard after. |
| **Control Room → Sovereign** | The deployment profile itself, verification, trust store, offline update history (Phase 6). |
| **Executive Workspaces** | An installed pack adds a lens beside CEO, CTO, CISO, Risk, Compliance, Operations, Finance and Legal — the same twin, projected for a mission authority. |
| **Managed Governance** | Pack recommendations enter the same proposal → Ω → approval → execution → evidence path as every other recommendation. |
| **`guardian` CLI** | `guardian sovereign` (posture and per-pack admissibility), `guardian sovereign classifications`, `guardian pack list` (marks each sovereign pack admissible or not, here). |
| **API** | `GET /api/ops/sovereign-packs` — catalog, posture, classifications, per-pack intelligence, dashboards. Read-only by design; installation is not exposed. |
| **Website** | `/sovereign-intelligence-packs` — commercial catalog, rendered from the same registry, so a published figure cannot drift from what installs. |

---

## 7. Honest measurement

Sovereign packs lead with **operational readiness** rather than compliance
posture — a national operator's first question is whether the mission is
governed and ready, not whether the paperwork is filed.

Every readiness measure names its source in a **closed grammar** the projector
resolves:

| Source form | Resolves to |
|---|---|
| `health:<score>` | A governance-health sub-score (0–100, banded). |
| `pack:policies_enforcing` | This pack's Ω policies currently active. |
| `pack:blocked` | Actions this pack's policies actually refused. |
| `context:<name>` | A count from the shared enterprise context (open incidents, escalations, departments, evidence packs, drift…). |
| `estate:<kind>` / `estate:<kind>~<pattern>` | Entities of one kind in the governed estate, optionally filtered by a name pattern. |

**Anything else renders as an explicit `available:false` note carrying the
reason a real source is missing — never as a plausible-looking number.**

This is not a gap; it is the discipline. Several packs deliberately declare
measures the platform cannot ground today, because they are the measures the
domain actually cares about and the honest answer is "connect a source":

| Pack | Not instrumented | Reason shown to the operator |
|---|---|---|
| National Security | Cleared personnel coverage, compartment briefing currency | Requires a vetting/briefing source. |
| Defence Operations | Sortie generation rate, sustainment position | Requires force-generation and logistics sources. |
| Critical Infrastructure | Impact-tolerance headroom, measured restoration time | Requires a resilience-management source. |
| Public Sector | Appeals and overturn rate, citizen service outcomes | Requires casework and service-management sources. |
| National Healthcare | Clinical outcome measures, national opt-out position | Requires clinical audit and extract-service sources. |
| Research & Development | Export licence position, programme dual-use position | Requires licensing and research-management sources. |
| Cyber Operations | Mean time to contain, partner deconfliction currency | Requires incident-management and partner arrangements. |

Sovereign buyers are the last people who should be shown a fabricated metric.

---

## 8. Verification

```bash
npm run sovereign:packs        # 55 assertions, hermetic (mock engine, temp store)
npm run ops:test               # the full operations suite, including the above
npm run sovereign:ci           # Phase 6 deployment/bundle/profile suite
```

`scripts/ops/sovereign-packs.test.cjs` proves, among others:

- seven packs registered, satisfying the **same** contract as the eight Industry Packs;
- **no pack contains an executable value anywhere** in its object graph, and the registry refuses one that does;
- every policy uses an Ω domain and condition kind the kernel **already** defines;
- a pack is **refused** on a deployment below its classification, and the refusal leaves the enterprise untouched;
- on a sovereign deployment a pack **cannot** be installed over the network — signed media only, signature verified first;
- the kernel then enforces the pack's policies deny-only, and unrelated tools are unaffected;
- the sovereign lens shows the **same governance score** as the CEO workspace;
- a pack round-trips through a bundle and renders **exactly the same sections** offline;
- a tampered bundle smuggling code in as content is refused at read time;
- a fully governed estate produces **no** findings — the pack does not manufacture work;
- uninstalling restores the exact prior baseline.

---

## 9. Security assumptions

1. **Admissibility is a supply-chain control, not a runtime one.** It decides
   what may be installed. It cannot make the kernel permit anything.
2. **Classification tiers are a mapping exercise.** They are jurisdiction-neutral
   handling bars expressed in deployment guarantees. Mapping an organisation's
   national scheme onto them is an assessment activity, not something the
   platform can infer.
3. **The guarantees are those the platform can observe about itself.** A profile
   asserting `local_state` means Guardian OS pins state locally. It is not a
   statement about the physical security, network segregation or personnel
   vetting of the facility — those remain the operator's responsibility and are
   out of scope for anything software can assert.
4. **The kernel-domain mirror in the sovereign registry is a cheaper, earlier
   copy** of a check `govpolicy.validateSpec` already performs. It can only ever
   be equal to or stricter than the kernel's list, never looser.
5. **Rollback stays available under an immutable runtime.** Removing a pack is
   the emergency brake and is deliberately not locked, for the reasons in
   `docs/SOVEREIGN.md` §10. Every rollback is audited and surfaced by
   `guardian verify`.

---

## 10. What is not claimed

- **No accreditation is implied.** These packs encode governance structures
  commonly required in these domains. They are not a national accreditation, a
  certification, or a legal opinion, and no organisation should treat
  installation as evidence of compliance with its own regime.
- **The policies are a reviewed starting point, not a finished control set.**
  Each pack's Ω policies name representative capability. A real estate's tools
  will not match those names exactly; part of assessment is binding the pack's
  authority model to the organisation's actual capability inventory.
- **Several readiness measures are deliberately not instrumented** (§7). Where a
  pack cannot ground a figure it says so, and connecting those sources is
  integration work, not a switch.
- **Classification tiers are not a national marking scheme** and must not be
  printed as one on evidence outputs without the organisation's own mapping.
- **A pack governs what it is told about.** Capability the organisation has not
  mapped into the twin cannot be governed, and the pack's recommendations
  surface exactly that gap rather than concealing it.

---

## 11. Adding a sovereign domain

A new sovereign domain is a **data file**:

1. Create `lib/ops/packs/sovereign/<domain>.js` — data only, no functions.
2. Add it to `PACKS` in `lib/ops/packs/sovereign/index.js`.
3. Use only Ω domains and condition kinds the kernel already defines.
4. Bind every readiness measure to a grounded source, or accept that it renders
   as an honest note.
5. Run `npm run sovereign:packs`.

This module, every Guardian OS service, the Control Room, the CLI, the bundle
format and the Runtime Governance kernel stay unchanged. Bespoke domain
intelligence can also be authored for a single organisation and delivered as a
signed bundle without altering the platform at all.

---

## 12. File map

| Path | Role |
|---|---|
| `lib/ops/sovereignty.js` | Classification tiers, deployment guarantees, admissibility gate, posture. |
| `lib/ops/packs/sovereign/index.js` | Sovereign registry, contract validation, the declarative guard, compilation. |
| `lib/ops/packs/sovereign/projections.js` | The shared platform projector — the only code that touches a sovereign pack. |
| `lib/ops/packs/sovereign/*.js` | The seven packs. Data only. |
| `lib/ops/packs/index.js` | One registry for both families. |
| `lib/ops/industry.js` | Install/uninstall/dashboard/recommendations, plus the admissibility gate. |
| `lib/sovereign/packs.js` | Bundle export, verification and full-fidelity sovereign round-trip. |
| `lib/sovereign-packs.ts` | The typed front door for the website, Control Room and API routes. |
| `app/api/ops/sovereign-packs/route.ts` | Read-only catalog, posture, pack intelligence, dashboards. |
| `app/sovereign-intelligence-packs/page.tsx` | Commercial catalog, rendered from the registry. |
| `components/admin/OperationsClient.tsx` | Control Room → Sovereign packs. |
| `scripts/ops/sovereign-packs.test.cjs` | The proof. |
