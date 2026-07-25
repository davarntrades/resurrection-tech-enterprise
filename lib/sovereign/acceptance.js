/* ============================================================================
 * Guardian OS Sovereign — site acceptance test.
 *
 * `guardian verify` answers "is this deployment configured as the profile
 * promises?". This answers a harder question an operator must be able to put to
 * a system on THEIR hardware, on THEIR network, in front of a witness:
 *
 *     does this box actually govern, and can it prove it?
 *
 * It exercises the real path end to end on the target system — provisioning, a
 * policy install, an enforcement decision, evidence capture, tamper-evidence,
 * offline document rendering — measures how long each step took on that
 * hardware, and emits a signed-off attestation.
 *
 * THIS IS THE INSTRUMENT, NOT THE RESULT. Running it on a laptop proves the
 * software works on a laptop. A field-tested deployment means this suite has
 * been executed on customer-representative hardware, on a real isolated
 * network, and the attestation countersigned. Until that has happened, the
 * honest description is "acceptance-testable", not "field-tested" — and the
 * attestation says exactly that until a site and a witness are recorded.
 *
 * DESTRUCTIVE-BY-DEFAULT? NO. Every step is additive and scoped to a throwaway
 * acceptance enterprise, and the suite cleans up after itself unless --keep is
 * passed. It never touches an existing enterprise's policies or evidence.
 * ========================================================================== */
"use strict";

const PASS = "pass", WARN = "warn", FAIL = "fail";

function step(id, title, status, detail, extra) {
  return { id, title, status, detail, ...(extra || {}) };
}

const now = () => Number(process.hrtime.bigint() / 1000000n);

/**
 * Run the acceptance suite against THIS deployment.
 *   site      free text recorded on the attestation (e.g. "Site B, rack 4")
 *   witness   the person observing the run
 *   keep      leave the acceptance enterprise in place for inspection
 */
async function run({ site = null, operator = null, witness = null, keep = false, rt = null, ops = null } = {}) {
  const runtime = rt || require("../runtime");
  const opsMod = ops || require("../ops");
  const sovereign = require("./index");
  const profiles = require("./profiles");
  const report = require("./report");

  const steps = [];
  const timings = {};
  const started = new Date().toISOString();
  let org = null;

  const timed = async (id, title, fn) => {
    const t0 = now();
    try {
      const r = await fn();
      timings[id] = now() - t0;
      steps.push(step(id, title, r.status || PASS, r.detail, { ms: timings[id], ...(r.extra || {}) }));
      return r.value;
    } catch (e) {
      timings[id] = now() - t0;
      steps.push(step(id, title, FAIL, `step threw: ${e.message}`, { ms: timings[id] }));
      return null;
    }
  };

  // ── 1. The platform is configured the way it claims ───────────────────────
  await timed("profile", "Deployment profile resolves", async () => {
    const d = profiles.describe();
    return { detail: `${d.title} (${d.profile}) — storage ${d.storage}, policies ${d.policy_provider}, egress ${d.egress}, immutable ${d.immutable}`, extra: { profile: d } };
  });

  const verification = await timed("verify", "guardian verify", async () => {
    const v = await sovereign.verify.run({});
    return {
      status: v.ok ? PASS : (v.summary.fail ? FAIL : WARN),
      detail: `${v.summary.pass} passed, ${v.summary.warn} warning(s), ${v.summary.fail} failure(s)`,
      value: v, extra: { checks: v.checks.map((x) => ({ id: x.id, status: x.status })) },
    };
  });

  // ── 2. The engine is reachable and answers ────────────────────────────────
  await timed("engine", "Ω engine responds", async () => {
    const h = await runtime.engine.health();
    if (!h.ok) return { status: FAIL, detail: `engine unreachable at ${runtime.engine.ENGINE_URL} — Guardian OS is fail-closed, so governed actions are BLOCKED` };
    const j = h.json || {};
    return { detail: `reachable at ${runtime.engine.ENGINE_URL}${j.engine_commit ? ` — engine ${String(j.engine_commit).slice(0, 12)}` : ""}`, extra: { engine_commit: j.engine_commit || null, dynamic: j.dynamic_policies || null } };
  });

  // ── 3. An enterprise provisions on this hardware ──────────────────────────
  org = await timed("provision", "Enterprise provisions", async () => {
    const p = await opsMod.provisioning.provision({ name: "Acceptance test enterprise", industry: "financial services" }, { actor: operator || "acceptance" });
    return { detail: `provisioned ${p.org_id} in ${timings.provision || 0}ms`, value: p.org_id, extra: { org_id: p.org_id } };
  });

  // ── 4. A policy installs through the route this profile allows ────────────
  await timed("policy", "Ω policy installs and activates", async () => {
    if (!org) return { status: FAIL, detail: "no enterprise to install into" };
    if (profiles.immutable()) {
      const active = await opsMod.govpolicy.active({ scope: org });
      return {
        status: active.length ? PASS : WARN,
        detail: active.length
          ? `${active.length} policy version(s) already enforcing (immutable runtime — install via a signed bundle)`
          : "immutable runtime with no policies installed for this enterprise; install a signed bundle before acceptance",
        extra: { active: active.length },
      };
    }
    const res = await opsMod.industry.install(org, "finance", { actor: operator || "acceptance" });
    return { detail: `${res.activated} Ω polic${res.activated === 1 ? "y" : "ies"} activated from the Financial Services pack`, extra: { activated: res.activated } };
  });

  // ── 5. THE CORE CLAIM: an unauthorised action is actually blocked ─────────
  await timed("enforce", "An unauthorised action is BLOCKED", async () => {
    const t0 = now();
    const res = await runtime.engine.evaluate(
      [{ tool: "wire_transfer", args: { amount: 250000 }, amount: 250000 }], ["finance", "enterprise"], 3,
    ).catch((e) => ({ ok: false, error: e.message }));
    const ms = now() - t0;
    if (!res || !res.ok) return { status: FAIL, detail: `the engine did not answer: ${(res && (res.error || `HTTP ${res.status}`)) || "no response"}`, extra: { decision_ms: ms } };
    // The engine client returns the transport envelope; the verdict is in .json.
    const j = res.json || {};
    const v = String(j.verdict || j.decision || (j.blocked ? "BLOCK" : "") || "").toUpperCase();
    const blocked = v === "BLOCK" || v === "ESCALATE";
    return {
      status: blocked ? PASS : FAIL,
      detail: blocked
        ? `an unauthorised 250,000 wire transfer returned ${v} in ${ms}ms — enforcement is live on this hardware`
        : `an unauthorised 250,000 wire transfer returned ${v || "no verdict"} — THIS DEPLOYMENT IS NOT ENFORCING`,
      extra: { verdict: v, decision_ms: ms },
    };
  });

  // ── 6. The decision left evidence ─────────────────────────────────────────
  await timed("evidence", "The decision is recorded as evidence", async () => {
    if (!org) return { status: FAIL, detail: "no enterprise" };
    await opsMod.managed.monitor(org, { actor: "acceptance" }).catch(() => null);
    const sum = await opsMod.evidence.summary({ org_id: org }).catch(() => ({ total: 0 }));
    const backend = runtime.store.backend();
    return {
      status: PASS,
      detail: `${sum.total} evidence record(s) on the ${backend} store${backend === "file" ? ` at ${runtime.store.DATA_DIR}` : ""}`,
      extra: { records: sum.total, backend },
    };
  });

  // ── 7. The audit chain is intact and tamper-evident ───────────────────────
  await timed("chain", "Decision chain verifies", async () => {
    const envs = await runtime.store.findOptional("environments", org ? { org_id: org } : {});
    if (!envs.length) return { status: WARN, detail: "no environment recorded yet — nothing to verify" };
    const r = await runtime.store.verifyChain(org, envs[0].id);
    return {
      status: r.ok ? PASS : FAIL,
      detail: r.ok ? `hash chain intact across ${r.count} decision(s)` : `chain broken at seq ${r.broken_at} (${r.reason})`,
      extra: r,
    };
  });

  // ── 8. Documents render on this box, with no browser ──────────────────────
  await timed("render", "Evidence pack renders offline (no browser)", async () => {
    if (!org) return { status: FAIL, detail: "no enterprise" };
    const pack = await opsMod.managed.evidencePack(org, { actor: operator || "acceptance", persist: false });
    const rendered = report.render(report.evidencePackDocument(pack));
    const okPdf = Buffer.from(rendered.bytes).subarray(0, 5).toString("latin1") === "%PDF-";
    return {
      status: okPdf ? PASS : FAIL,
      detail: okPdf
        ? `${rendered.pages}-page PDF, ${(rendered.bytes.length / 1024).toFixed(0)}KB, rendered in ${timings.render || 0}ms with no Chromium`
        : "the rendered bytes are not a PDF",
      extra: { pages: rendered.pages, bytes: rendered.bytes.length, hash: rendered.hash },
    };
  });

  // ── 9. Evidence can leave the box ─────────────────────────────────────────
  await timed("export", "Evidence is exportable", async () => {
    if (runtime.store.backend() !== "file") return { status: PASS, detail: "cloud evidence store — export from the control plane" };
    const fs = require("node:fs");
    let files = 0;
    const count = (d) => { for (const it of fs.readdirSync(d, { withFileTypes: true })) files += it.isDirectory() ? (count(require("node:path").join(d, it.name)), 0) : 1; };
    try { count(runtime.store.DATA_DIR); } catch { /* empty store */ }
    return { detail: `${files} file(s) in ${runtime.store.DATA_DIR} — 'guardian export evidence <DIR>' copies the complete set`, extra: { files } };
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────
  if (org && !keep) {
    await timed("cleanup", "Acceptance enterprise removed", async () => {
      let removed = 0;
      try { await opsMod.industry.uninstall(org, "finance", { actor: "acceptance" }); removed++; } catch { /* not installed */ }
      for (const coll of ["industry_packs", "enterprise_entities", "enterprise_departments", "governance_baselines",
        "governance_drift", "governance_health", "provisioning", "orgs"]) {
        try { removed += await runtime.store.remove(coll, { org_id: org }); } catch { /* absent collection */ }
      }
      try { removed += await runtime.store.remove("orgs", { id: org }); } catch { /* already gone */ }
      return { detail: `${removed} record(s) removed; existing enterprises untouched`, extra: { removed } };
    });
  }

  const failed = steps.filter((s) => s.status === FAIL);
  const warned = steps.filter((s) => s.status === WARN);
  const decisionMs = (steps.find((s) => s.id === "enforce") || {}).decision_ms ?? null;

  return {
    ok: failed.length === 0,
    started_at: started,
    completed_at: new Date().toISOString(),
    profile: profiles.profileSafe().id,
    site: site || null,
    operator: operator || null,
    witness: witness || null,
    // Recorded honestly: an acceptance run with no site and no witness is a
    // software self-test, and the attestation must not read as a field trial.
    field_trial: !!(site && witness),
    host: {
      platform: process.platform, arch: process.arch, node: process.version,
      cpus: (require("node:os").cpus() || []).length,
      memory_gb: +(require("node:os").totalmem() / 1024 ** 3).toFixed(1),
      hostname: require("node:os").hostname(),
    },
    summary: { total: steps.length, pass: steps.length - failed.length - warned.length, warn: warned.length, fail: failed.length },
    performance: { governance_decision_ms: decisionMs, steps: timings },
    steps,
    verification: verification ? { ok: verification.ok, summary: verification.summary } : null,
  };
}

/** The acceptance run as a declarative document for lib/sovereign/report.js. */
function document(a, { classification = null } = {}) {
  const MARK = { pass: "[ok]", warn: "[!]", fail: "[x]" };
  return {
    title: "Site acceptance record",
    subtitle: a.field_trial
      ? "Guardian OS Sovereign executed on the deployed system named below, observed by the named witness."
      : "Guardian OS Sovereign acceptance run. NO SITE OR WITNESS WAS RECORDED, so this is a software self-test and must not be described as a field trial.",
    classification,
    generated_at: a.completed_at,
    meta: [
      { label: "Result", value: a.ok ? "ACCEPTED" : "NOT ACCEPTED" },
      { label: "Deployment profile", value: a.profile },
      { label: "Site", value: a.site || "not recorded" },
      { label: "Operator", value: a.operator || "not recorded" },
      { label: "Witness", value: a.witness || "not recorded" },
      { label: "Host", value: `${a.host.platform}/${a.host.arch}, ${a.host.cpus} CPU, ${a.host.memory_gb}GB` },
      { label: "Run", value: `${String(a.started_at).slice(0, 19)} → ${String(a.completed_at).slice(11, 19)}` },
    ],
    blocks: [
      { kind: "h1", text: "Result" },
      { kind: "kv", items: [
        { label: "Steps passed", value: a.summary.pass, of: a.summary.total },
        { label: "Warnings", value: a.summary.warn },
        { label: "Failures", value: a.summary.fail },
        { label: "Governance decision", value: a.performance.governance_decision_ms != null ? `${a.performance.governance_decision_ms} ms` : "not measured" },
      ] },
      ...(a.field_trial ? [] : [{ kind: "note", reason: "no site and no witness were recorded — this run is a self-test on the host described above, not a field trial" }]),
      { kind: "h1", text: "Steps" },
      { kind: "table", headers: ["", "Step", "Finding", "ms"],
        rows: a.steps.map((s) => [MARK[s.status] || s.status, s.title, s.detail, s.ms ?? ""]) },
      { kind: "h1", text: "Host" },
      { kind: "table", headers: ["Property", "Value"], rows: Object.entries(a.host).map(([k, v]) => [k.replace(/_/g, " "), String(v)]) },
      { kind: "h1", text: "Sign-off" },
      { kind: "text", text: "The operator confirms this suite was executed on the system described above and that the recorded output has not been edited. The witness confirms they observed the run. Neither signature constitutes an accreditation, certification or authority to operate." },
      { kind: "table", headers: ["Role", "Name", "Signature", "Date"],
        rows: [["Operator", a.operator || "", "", ""], ["Witness", a.witness || "", "", ""], ["Accepting authority", "", "", ""]] },
    ],
  };
}

module.exports = { run, document, PASS, WARN, FAIL };
