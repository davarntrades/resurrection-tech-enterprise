# Limited pilots — establishing policy facts

## The one rule

A policy fact a pilot's systems established is **trusted**. The same fact
written into a tool call's arguments is **the agent talking about itself**, and
the engine treats it as such.

```
  agent / peer                      your systems
       │                                 │
  call args, nested,              gateway-signed header
  aliases, JSON                          │
       │                                 ▼
   UNTRUSTED ──► satisfies nothing   TRUSTED ──► may satisfy an Ω attestation
```

This is not a naming rule. An invented field (`guardian_ack`,
`coordinator_ceo1_confirmed`) is refused for the same reason `hipaa_authorized`
is: provenance, not spelling. There is no list to keep up to date.

## What changes for a pilot

If a pilot today sends an authorisation inside `args`, it stops taking effect.

```jsonc
// BEFORE — the claim authorised itself
{"trajectory": [{"tool": "send_email",
                 "args": {"to": "...", "contains_phi": true,
                          "hipaa_authorized": true}}]}     // now BLOCK

// AFTER — the fact is established by the deployment
// header: x-governance-trusted-facts: {"hipaa_authorized": true}
// header: x-governance-gateway-auth:  <gateway secret>
{"trajectory": [{"tool": "send_email",
                 "args": {"to": "...", "contains_phi": true}}]}   // PERMIT
```

## Wiring it

`POST /v1/govern` accepts trusted facts on exactly the terms it already accepts
identity — from the gateway, never from the body:

| header | purpose |
|---|---|
| `x-governance-trusted-facts` | JSON object, scalar values, ≤ `GOVERNANCE_MAX_TRUSTED_FACTS` (32) |
| `x-governance-gateway-auth` | the gateway shared secret; **without it the facts are ignored** |
| `x-governance-principal` / `-tenant` | identity, unchanged |

Set `GOVERNANCE_GATEWAY_SECRET`. With no gateway configured the header is
ignored and the response says so — a pilot cannot silently depend on an
unverified claim.

## Reading the response

Every `/v1/govern` response carries a `trusted_facts` block:

```json
"trusted_facts": {
  "accepted": ["hipaa_authorized"],
  "count": 1,
  "source": "gateway_verified",
  "gateway_auth_configured": true,
  "note": "policy facts asserted inside a call's args are caller data ..."
}
```

`source` is the first thing to check when a pilot reports an unexpected refusal:

| `source` | meaning |
|---|---|
| `gateway_verified` | honoured |
| `none_presented` | no header sent |
| `ignored_no_gateway_secret` | service has no `GOVERNANCE_GATEWAY_SECRET` |
| `rejected_untrusted_header` | header present, gateway signature absent or wrong |
| `rejected_malformed` / `rejected_not_an_object` / `rejected_too_many` | header unusable |

Anything other than `gateway_verified` means the facts did **not** apply.

## Two things trusted facts deliberately cannot do

1. **Override what the kernel resolved itself.** Asserting
   `destination_external: false` does not make an external destination
   internal. The kernel resolves destinations from its own trusted config and
   wins.
2. **Override what the content says.** PHI addressed outside your domains stays
   blocked with a verified `hipaa_authorized` in hand, because the rule that
   fires reads the payload. Trusted provenance answers *who established this
   fact* — never *what is actually in this request*.

Both are pinned in `test_trusted_facts_provenance.py`.

## Pilot checklist

- [ ] `GOVERNANCE_GATEWAY_SECRET` set; gateway signs every governed request
- [ ] Gateway populates `x-governance-trusted-facts` from **your** systems of
      record — never by copying fields out of the agent's request
- [ ] Pilot's agent code no longer writes authorisations into `args`
- [ ] Dashboards surface `trusted_facts.source`; alert on anything that is not
      `gateway_verified`
- [ ] Replay a pre-pilot trace and diff verdicts — every new BLOCK should be a
      self-asserted authorisation, and each one is a real finding

## Known limits

Independent derivation contradicts a caller's claim only from evidence present
in the payload. If the pilot sends a label (`user_state`) without the material
it describes, nothing can check it. **Send the conversation if you want the
conversation governed.** Content classifiers are also not complete: an unusual
paraphrase may not be recognised. Both are recorded as residuals in the
engine's `limits_audit/FINDINGS_HARDENING.md`.
