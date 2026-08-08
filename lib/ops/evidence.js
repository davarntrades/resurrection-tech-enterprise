/* ============================================================================
 * Operations Agent — evidence generation (every decision leaves a record).
 *
 * One append-style row per governance decision on an agent proposal:
 * timestamp · actor · agent · policy · risk · reason · verdict · execution
 * result · customer/org — searchable from the Control Room and surfaced next
 * to the customer's existing Evidence Hub material. Rows are write-once: the
 * module exposes no update/delete, and the engine's ops_evidence_destruction
 * rule blocks the agent from ever proposing their removal.
 *
 * TAMPER-EVIDENCE
 * ---------------
 * "The module exposes no update/delete" is a property of THIS module, not of
 * the storage underneath it. Anyone with store access — an operator, a leaked
 * service-role key, a compromised process — could previously edit a row and
 * leave nothing behind: a `block` could become an `allow`, or an executed
 * action could lose its execution record, and every read path would report the
 * altered value as fact. That is the exact weakness the kernel's EvidenceChain
 * closes on the /v1/govern path; this module closes it on the ops path.
 *
 * Every record now carries:
 *
 *   seq          monotonic position in the chain
 *   prev_hash    record_hash of the preceding record (GENESIS for the first)
 *   record_hash  sha256 over the canonical serialisation of every other field
 *
 * so altering any field of any record breaks that record's own hash, and
 * altering or removing an earlier record breaks every subsequent link. Both
 * are reported by `verify()`, which names the failing record rather than
 * returning a bare false.
 *
 * DETERMINISM. The hash is taken over `canonicalJson` (recursively
 * key-sorted), so it depends on record CONTENT and not on key insertion order,
 * JSON whitespace, or which process wrote it. `created_at` is generated once,
 * hashed, and stored — never re-derived at verification time. A record written
 * today verifies identically after a restart, on another machine, and from a
 * different storage backend.
 *
 * CONCURRENCY, STATED HONESTLY. Appends are serialised by an in-process lock,
 * so a single service instance always produces a well-formed chain. The store
 * exposes no transaction, so two INSTANCES appending concurrently can allocate
 * the same `seq` and fork the chain. That is detected and reported by
 * `verify()` as a fork — it is never silently repaired, and the fork is not
 * treated as tampering, because it is not.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const store = rt.store;

const GENESIS = "0".repeat(64);
const HASH_ALG = "sha256-canonical-v1";

/** Recursively key-sorted serialisation — the platform's single definition. */
const canonicalJson = (value) => rt.integrationGateway.canonicalJson(value);

/**
 * The fields bound by `record_hash`, in one place.
 *
 * Everything that a reader would rely on is covered: identity, decision,
 * governance provenance and execution outcome. `record_hash` itself is
 * excluded (it is the output), and so is `id`, which the store assigns.
 */
function digestPayload(r) {
  return {
    seq: r.seq,
    prev_hash: r.prev_hash,
    created_at: r.created_at,
    actor: r.actor || null,
    agent: r.agent || null,
    agent_id: r.agent_id || null,
    action_id: r.action_id || null,
    proposal_id: r.proposal_id || null,
    org_id: r.org_id || null,
    environment_id: r.environment_id || null,
    policy: r.policy || null,
    risk: r.risk || null,
    verdict: r.verdict || null,
    reason: r.reason || "",
    rule: r.rule || null,
    omega_domain: r.omega_domain || null,
    trajectory_hash: r.trajectory_hash || null,
    // Governance provenance: which ruleset issued this verdict. Without it a
    // record proves a decision was made but not what policy produced it.
    ruleset_hash: r.ruleset_hash || null,
    engine_commit: r.engine_commit || null,
    // Provider/action metadata: connector, model, request binding.
    provider: r.provider || null,
    execution: r.execution || null,
  };
}

const hashRecord = (r) => store.sha256(canonicalJson(digestPayload(r)));

/* ── append serialisation ──────────────────────────────────────────────────
 * Reading the head and writing the successor must not interleave, or two
 * concurrent appends both link to the same predecessor. A promise chain is
 * sufficient here and avoids a dependency; `then(fn, fn)` keeps the lock
 * flowing after a rejected append rather than wedging the chain.
 * ------------------------------------------------------------------------ */
let appendLock = Promise.resolve();
function withAppendLock(fn) {
  const run = appendLock.then(fn, fn);
  appendLock = run.then(() => undefined, () => undefined);
  return run;
}

/** Current chain head, by highest seq. */
async function head() {
  const rows = await store.find("ops_evidence", {});
  if (!rows.length) return { seq: -1, record_hash: GENESIS };
  const ordered = rows
    .filter((r) => Number.isInteger(r.seq))
    .sort((a, b) => a.seq - b.seq);
  if (!ordered.length) {
    // Legacy rows only (written before chaining). The chain starts fresh above
    // them; they are reported as unverifiable by `verify()`, never as tampered.
    return { seq: -1, record_hash: GENESIS };
  }
  return ordered[ordered.length - 1];
}

function shape(r) {
  if (!r) return null;
  return {
    id: r.id,
    created_at: r.created_at,
    actor: r.actor || "operations_agent",
    agent: r.agent || "resurrection-tech-ops-agent",
    agent_id: r.agent_id || null,       // Pillar 4: attributing specialist agent (sales/cs/…)
    action_id: r.action_id,
    proposal_id: r.proposal_id || null,
    org_id: r.org_id || null,
    environment_id: r.environment_id || null,
    policy: r.policy || null,
    risk: r.risk || null,
    verdict: r.verdict,
    reason: r.reason || "",
    rule: r.rule || null,
    omega_domain: r.omega_domain || null,
    trajectory_hash: r.trajectory_hash || null,
    ruleset_hash: r.ruleset_hash || null,
    engine_commit: r.engine_commit || null,
    provider: r.provider || null,
    execution: r.execution || null, // { executed, result?, error? }
    // chain fields
    seq: Number.isInteger(r.seq) ? r.seq : null,
    prev_hash: r.prev_hash || null,
    record_hash: r.record_hash || null,
    hash_alg: r.hash_alg || null,
  };
}

/** Record one decision (and, when present, its execution outcome). */
async function record({
  action_id, proposal_id = null, org_id = null, environment_id = null,
  actor = "operations_agent", agent = "resurrection-tech-ops-agent", agent_id = null,
  policy, risk, verdict, reason, rule = null, omega_domain = null,
  trajectory_hash = null, execution = null,
  ruleset_hash = null, engine_commit = null, provider = null,
}) {
  const row = await withAppendLock(async () => {
    const prev = await head();
    // `created_at` is generated HERE, hashed, and then stored — so the value
    // that is bound by the hash is the value that is persisted.
    const draft = {
      seq: prev.seq + 1,
      prev_hash: prev.record_hash || GENESIS,
      created_at: store.nowISO(),
      actor, agent, agent_id: agent_id || null,
      action_id, proposal_id, org_id, environment_id,
      policy: policy || null, risk: risk || null, verdict,
      reason: String(reason || "").slice(0, 4000),
      rule, omega_domain, trajectory_hash,
      ruleset_hash: ruleset_hash || null,
      engine_commit: engine_commit || null,
      provider: provider || null,
      execution: execution || null,
    };
    return store.insert("ops_evidence", {
      ...draft,
      record_hash: hashRecord(draft),
      hash_alg: HASH_ALG,
    });
  });
  rt.log.info("ops_evidence", {
    id: row.id, action_id, verdict, org_id,
    seq: row.seq, record_hash: String(row.record_hash || "").slice(0, 12),
  });
  return shape(row);
}

/**
 * Verify the chain.
 *
 * Returns `{ ok, records, verified, legacy, problems }`. Three failure modes
 * are distinguished, because conflating them would either accuse innocent data
 * or excuse real tampering:
 *
 *   tampered  a record's content no longer matches its own record_hash
 *   broken    a record's prev_hash does not match its predecessor's hash
 *             (this is what deleting or reordering a record produces)
 *   forked    two records share a seq — concurrent writers, not tampering
 *
 * Rows written before chaining carry no `seq`/`record_hash`. They are counted
 * as `legacy` and reported as unverifiable, never as tampered: an absent hash
 * cannot distinguish an old serialisation from an alteration, and guessing in
 * the accusing direction is unacceptable.
 */
async function verify({ org_id } = {}) {
  const rows = await store.find("ops_evidence", org_id ? { org_id } : {});
  const chained = rows.filter((r) => Number.isInteger(r.seq) && r.record_hash);
  const legacy = rows.length - chained.length;
  chained.sort((a, b) => a.seq - b.seq);

  const problems = [];
  let prevHash = GENESIS;
  let prevSeq = -1;

  for (const r of chained) {
    if (r.seq === prevSeq) {
      problems.push({
        type: "forked", seq: r.seq, id: r.id,
        detail: `two records share seq ${r.seq} — concurrent writers forked the chain`,
      });
    } else if (r.seq !== prevSeq + 1) {
      problems.push({
        type: "broken", seq: r.seq, id: r.id,
        detail: `sequence gap: expected seq ${prevSeq + 1}, found ${r.seq} — a record is missing`,
      });
    }
    const expected = hashRecord(r);
    if (expected !== r.record_hash) {
      problems.push({
        type: "tampered", seq: r.seq, id: r.id,
        detail: `record ${r.seq} content does not match its record_hash`,
      });
    }
    if (r.prev_hash !== prevHash) {
      problems.push({
        type: "broken", seq: r.seq, id: r.id,
        detail: `record ${r.seq} chain break: prev_hash ${String(r.prev_hash || "").slice(0, 12)}… `
              + `!= ${String(prevHash).slice(0, 12)}…`,
      });
    }
    prevHash = r.record_hash;
    prevSeq = r.seq;
  }

  return {
    ok: problems.length === 0,
    records: rows.length,
    verified: chained.length,
    legacy,
    head: chained.length ? chained[chained.length - 1].record_hash : GENESIS,
    problems,
  };
}

/** Search evidence. Filters: org_id, verdict, action_id, agent_id, since (ISO). */
async function search({ org_id, verdict, action_id, agent_id, since, limit = 100 } = {}) {
  const where = {};
  if (org_id) where.org_id = org_id;
  if (verdict) where.verdict = verdict;
  if (action_id) where.action_id = action_id;
  if (agent_id) where.agent_id = agent_id;
  let rows = await store.find("ops_evidence", where);
  if (since) rows = rows.filter((r) => String(r.created_at) >= since);
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return rows.slice(0, Math.max(1, Math.min(1000, limit))).map(shape);
}

/** Counts for the dashboard: total + per-verdict + last 24h blocked. */
async function summary({ org_id } = {}) {
  const rows = await store.find("ops_evidence", org_id ? { org_id } : {});
  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const by = { allow: 0, block: 0, escalate: 0 };
  let blocked24h = 0, executed = 0;
  for (const r of rows) {
    if (by[r.verdict] !== undefined) by[r.verdict] += 1;
    if (r.verdict === "block" && String(r.created_at) >= dayAgo) blocked24h += 1;
    if (r.execution && r.execution.executed) executed += 1;
  }
  return { total: rows.length, by_verdict: by, blocked_24h: blocked24h, executed };
}

module.exports = {
  record, search, summary, shape, verify,
  GENESIS, HASH_ALG, hashRecord, digestPayload,
};
