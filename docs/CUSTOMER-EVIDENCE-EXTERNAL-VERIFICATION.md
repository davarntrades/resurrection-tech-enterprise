# Customer Evidence Hub — external evaluation

This document describes the existing customer evidence path. It does not create
a new portal, evidence authority or audit product.

## Current path

1. The evaluator sends a proposal to `POST /api/runtime/execute` with a stable
   `correlation_id`; its own environment log records the same value.
2. Morrison records the governance decision in `rg_decisions`, including the
   verdict, rule, trajectory hash, engine/ruleset provenance and correlation ID.
3. The authorized execution adapter records execution or withholding in
   `rg_execution_records`, linked by `morrison_decision_id` and `correlation_id`.
4. An operator generates **Monthly Governance Evidence** or an **Executive
   Summary**. The existing evidence pack now includes `morrison-audit-v2.json`.
5. The evaluator opens its durable **Customer Evidence Hub** link and retains the
   JSON from the **Evidence Library**, alongside the HTML/PDF reports.
6. The evaluator verifies the retained export:

   ```sh
   node scripts/runtime/verify-audit-v2.cjs ./morrison-audit-v2.json
   ```

7. The evaluator joins its own tool/environment events to the export using
   `correlation_id` (and `request_id` where supplied), then checks the linked
   `morrison_decision_id`, verdict, execution status, receipt and observed state
   hashes.

## What verification means

The verifier recomputes every export record hash, checks record order, linkage,
count and the retained head hash. It detects modification after export unless an
attacker can replace both the file and every independently retained hash/copy.

It does **not** authenticate Resurrection Tech as the author: the export is not
digitally signed. It also does not prove that an external event happened. The
evaluator establishes that by comparing the identifiers and observed outcomes
with logs from the environment it controls.

The source decision chain and source execution-record hash are included as
metadata. The decision chain covers its defined immutable core fields. The
execution hash covers the fields defined by `evidenceCore()` in
`lib/runtime/execution-adapters/evidence.js`. The outer audit-v2 chain covers all
fields included in the downloaded export.

## Data availability

Full proposed tool arguments appear only when the customer environment has
explicitly enabled payload retention (`store_payloads`). Otherwise the export
preserves tool names and the trajectory hash and states that proposal fidelity is
limited. No missing payload, model identifier, policy identifier or result is
inferred.

Hub access remains read-only, capability-token scoped and organisation scoped.
Rotating or revoking the durable link does not alter copies the evaluator has
already retained.
