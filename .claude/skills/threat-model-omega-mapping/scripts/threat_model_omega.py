#!/usr/bin/env python3
"""threat-model-omega-mapping — map a prospect threat model onto the live Ω
catalog, produce a coverage matrix + gap analysis + pilot scope + exec summary,
and emit onboard-ready specs. See ../SKILL.md. Reuses verify-production +
replay + sector_rules; defines NO governance logic of its own."""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import re
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "..", "verify-production", "scripts"))
import verify_production as vp  # noqa: E402

# Reusable cross-domain patterns — present in every sector; coverage by these
# alone is "partial" (the trajectory shape is governed, not a domain-specific Ω).
REUSABLE = {"approval_spoofing", "role_escalation", "state_transition_abuse",
            "sensitive_egress", "unauthorized_delegation"}

# Threat phrase → candidate rule-name SUBSTRINGS. Only substrings that resolve to
# a rule actually present in the live catalog are ever reported (see map_threat).
ONTOLOGY: dict[str, list[str]] = {
    "credential theft": ["credential_exfiltration"],
    "credential exfiltration": ["credential_exfiltration"],
    "secret leakage": ["credential_exfiltration", "sensitive_data_egress"],
    "api key": ["credential_exfiltration"],
    "pii export": ["pii_exfiltration", "customer_pii_external", "sensitive_data_egress", "indirect_sensitive_egress"],
    "pii exfiltration": ["pii_exfiltration", "sensitive_data_egress"],
    "personal data leak": ["pii_exfiltration", "customer_pii_external", "sensitive_data_egress"],
    "customer data leak": ["customer_pii_external", "sensitive_data_egress"],
    "phi": ["phi_exposure", "healthcare_phi_egress"],
    "patient data": ["phi_exposure", "healthcare_phi_egress"],
    "health data": ["phi_exposure", "healthcare_phi_egress"],
    "data exfiltration": ["sensitive_data_egress", "indirect_sensitive_egress", "delegated_external_egress", "internal_artifact_leak"],
    "data egress": ["sensitive_data_egress", "indirect_sensitive_egress"],
    "data leak": ["sensitive_data_egress", "internal_artifact_leak"],
    "internal document leak": ["internal_artifact_leak"],
    "unauthorized transfer": ["unauthorized_transfer", "finance_high_value_unverified_transfer", "finance_funds_to_unverified_destination"],
    "fund transfer": ["finance_high_value_unverified_transfer", "finance_funds_to_unverified_destination", "unauthorized_transfer"],
    "wire fraud": ["finance_funds_to_unverified_destination", "finance_payment_rerouting"],
    "payment rerouting": ["finance_payment_rerouting", "finance_destination_change_after_verification"],
    "payment fraud": ["finance_payment_rerouting", "fraud_split_transfer"],
    "structuring": ["structuring_pattern", "fraud_split_transfer"],
    "smurfing": ["structuring_pattern", "fraud_split_transfer"],
    "transaction velocity": ["velocity_anomaly"],
    "synthetic identity": ["synthetic_identity"],
    "guaranteed returns": ["guaranteed_profit"],
    "privilege escalation": ["privilege_escalation", "role_privilege_escalation", "role_escalation", "unauthorized_role_change"],
    "role escalation": ["role_escalation", "role_privilege_escalation", "unauthorized_role_change"],
    "admin grant": ["role_privilege_escalation", "unauthorized_role_change"],
    "approval bypass": ["approval_spoofing", "finance_approval_tampering", "critical_change_after_verification"],
    "approval spoofing": ["approval_spoofing", "finance_approval_tampering"],
    "review bypass": ["approval_spoofing", "critical_change_after_verification"],
    "four eyes bypass": ["approval_spoofing", "finance_approval_tampering"],
    "shell injection": ["shell_injection"],
    "command injection": ["shell_injection"],
    "remote code execution": ["shell_injection", "exec_plus_external_url"],
    "code execution": ["shell_injection"],
    "card data exposure": ["pci_card_exposure", "compliance_regulated_data_export"],
    "pci": ["pci_card_exposure", "compliance_regulated_data_export"],
    "gdpr purpose": ["gdpr_purpose_mismatch"],
    "purpose limitation": ["gdpr_purpose_mismatch"],
    "unencrypted transmission": ["encryption_missing"],
    "missing encryption": ["encryption_missing"],
    "regulated data export": ["compliance_regulated_data_export", "pci_card_exposure", "gdpr_purpose_mismatch"],
    "cross-agent collusion": ["delegated_external_egress", "unauthorized_delegation", "indirect_sensitive_egress"],
    "multi-agent collusion": ["delegated_external_egress", "unauthorized_delegation"],
    "agent collusion": ["delegated_external_egress", "unauthorized_delegation"],
    "collusive exfiltration": ["delegated_external_egress", "indirect_sensitive_egress"],
    "unauthorized delegation": ["unauthorized_delegation", "delegated_external_egress"],
    "untrusted hand-off": ["unauthorized_delegation"],
    "delayed intent": ["abstraction_conceals_funds", "indirect_sensitive_egress", "finance_funds_after_unverified_access"],
    "delayed action": ["abstraction_conceals_funds", "finance_funds_after_unverified_access"],
    "staged exfiltration": ["indirect_sensitive_egress", "abstraction_conceals_funds"],
    "memory poisoning": ["memory_contamination"],
    "memory contamination": ["memory_contamination"],
    "context poisoning": ["memory_contamination", "contextual_drift_unsafe"],
    "state transition abuse": ["state_transition_abuse", "critical_change_after_verification", "finance_destination_change_after_verification"],
    "verify then mutate": ["critical_change_after_verification", "state_transition_abuse"],
    "classified egress": ["defence_classified_artifact_egress", "defence_cross_domain_transfer_unauthorized"],
    "data spillage": ["defence_cross_domain_transfer_unauthorized"],
    "weapons release": ["engagement_without_authorization", "defence_autonomous_engagement"],
    "autonomous engagement": ["defence_autonomous_engagement", "engagement_without_authorization"],
    "sim swap": ["sim_swap_or_port", "telecom"],
    "number port": ["sim_swap_or_port"],
    "lawful intercept": ["lawful_intercept"],
    "grid control": ["grid_control_without_authorization", "energy_grid_setpoint", "energy_control_write"],
    "scada": ["energy_control_write", "energy_protection_relay"],
    "safety interlock": ["safety_interlock", "energy_protection_relay", "manufacturing"],
    "claim fraud": ["insurance_claim_payout_to_unverified_payee", "claim_payout_without_authorization"],
    "benefit fraud": ["government_benefits_without_eligibility", "benefit_or_record_change_without_authorization"],
    "supplier fraud": ["supply_chain", "shipment", "vendor"],
    "self harm": ["self_harm", "crisis", "mental_health", "failure_to_route_crisis"],
    "crisis disclosure": ["failure_to_route_crisis", "false_reassurance_under_crisis"],
}

# Threats governed only indirectly (the injection/manipulation text is not a rule;
# the RESULTING trajectory still has to reach Ω, which IS governed). -> PARTIAL.
PARTIAL_INDIRECT = {
    "prompt injection": "Governed indirectly: the injected instruction is not itself a rule, but any "
                        "unsafe action it induces must still produce a trajectory that reaches Ω — that "
                        "action is blocked pre-execution. Recommend pairing with the reusable patterns "
                        "(approval/role/egress/delegation) for the target tools.",
    "jailbreak": "Governed indirectly: a jailbreak only matters if it yields a trajectory that reaches Ω, "
                 "which is blocked. The prompt text itself is out of scope for trajectory governance.",
    "agent manipulation": "Partially governed: coercion/manipulation markers map to recursive-pressure / "
                          "indirect-coercion Ω where present; for general agents, govern the resulting "
                          "actions via the reusable patterns.",
    "hallucination": "Out of scope for pre-execution trajectory governance (a content-quality concern); "
                     "governed only where a hallucinated action reaches a forbidden tool state.",
    "data poisoning": "Partially governed: training-time poisoning is out of scope; run-time memory/context "
                      "poisoning maps to memory_contamination / contextual_drift_unsafe.",
}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", s.lower()).strip()


def build_catalog(engine: str | None):
    if engine is None:
        return None
    from morrison_governance import OmegaDomain  # type: ignore
    from replay import _layer  # type: ignore
    domains = [d.value for d in OmegaDomain if d.value != "custom"]
    layer = _layer(domains, 3)
    cat, seen = [], set()
    for r in layer.rules:
        key = r.name
        if key in seen:
            continue
        seen.add(key)
        cat.append({"domain": r.domain.value, "name": r.name,
                    "description": getattr(r, "description", "") or ""})
    return cat


def map_threat(threat: str, cat: list[dict]) -> dict:
    t = _norm(threat)
    names = {c["name"] for c in cat}

    # indirect / out-of-scope first
    for phrase, why in PARTIAL_INDIRECT.items():
        if phrase in t:
            return {"status": "PARTIAL", "rules": [], "reason": why}

    matched: list[str] = []
    for phrase, subs in ONTOLOGY.items():
        words = phrase.split()
        if phrase in t or all(w in t for w in words):
            for sub in subs:
                matched += [n for n in names if sub in n]

    # token fallback against name + description
    if not matched:
        toks = [w for w in t.split() if len(w) > 3]
        for c in cat:
            hay = (c["name"] + " " + c["description"]).lower()
            if sum(1 for w in toks if w in hay) >= 2:
                matched.append(c["name"])

    matched = sorted(dict.fromkeys(matched))
    if not matched:
        return {"status": "UNCOVERED", "rules": [],
                "reason": "No loaded Ω rule matches this threat — recommend an Ω extension."}
    domain_specific = [m for m in matched if m not in REUSABLE]
    if domain_specific:
        return {"status": "COVERED", "rules": domain_specific[:4], "reason": ""}
    return {"status": "PARTIAL", "rules": matched[:4],
            "reason": "Covered only by reusable cross-domain patterns; add a domain-specific Ω for full coverage."}


# ── input ────────────────────────────────────────────────────────────────────

def _lst(v):
    if isinstance(v, list):
        return v
    return [x.strip() for x in str(v).split(",") if x.strip()] if v else []


def load_spec(a) -> dict:
    spec = {}
    if a.spec and os.path.isfile(a.spec):
        raw = open(a.spec).read()
        try:
            spec = json.loads(raw)
        except Exception:
            try:
                import yaml  # type: ignore
                spec = yaml.safe_load(raw)
            except Exception as e:  # noqa: BLE001
                raise SystemExit(f"could not parse --spec (JSON, or YAML if PyYAML present): {e}")
    threats = spec.get("threat_model") or _lst(a.threats)
    norm_threats = []
    for x in threats:
        if isinstance(x, dict):
            norm_threats.append({"name": x.get("name", "?"), "severity": str(x.get("severity", "—")).lower()})
        else:
            norm_threats.append({"name": str(x), "severity": "—"})
    return {
        "organization": spec.get("organization") or a.org or "the organization",
        "industry": (spec.get("industry") or a.industry or "enterprise").strip().lower(),
        "agent_architecture": spec.get("agent_architecture") or a.arch or "(not specified)",
        "tool_inventory": spec.get("tool_inventory") or _lst(a.tools),
        "critical_assets": spec.get("critical_assets") or _lst(a.assets),
        "threat_model": norm_threats,
        "regulatory_requirements": spec.get("regulatory_requirements") or _lst(a.regs),
        "existing_controls": spec.get("existing_controls") or _lst(a.controls),
    }


# ── report ─────────────────────────────────────────────────────────────────

def build(spec: dict, cat: list[dict] | None, engine_meta: dict) -> tuple[dict, dict]:
    ts = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = []
    for th in spec["threat_model"]:
        m = map_threat(th["name"], cat) if cat else {"status": "UNKNOWN", "rules": [], "reason": "engine unavailable"}
        rows.append({**th, **m})

    covered = [r for r in rows if r["status"] == "COVERED"]
    partial = [r for r in rows if r["status"] == "PARTIAL"]
    uncovered = [r for r in rows if r["status"] == "UNCOVERED"]
    total = len(rows) or 1
    pct = round(100 * (len(covered) + 0.5 * len(partial)) / total)

    # recommended Ω extension spec (onboard-sector compatible)
    gap_threats = [r["name"] for r in uncovered] + [r["name"] for r in partial if r["reason"].startswith("Covered only")]
    onboard_spec = {
        "tools": spec["tool_inventory"] or [f"{spec['industry']}_control_action"],
        "assets": spec["critical_assets"] or ["Sector-critical records"],
        "regs": spec["regulatory_requirements"] or ["<applicable regulation>"],
        "threats": gap_threats or ["<no uncovered threats>"],
    }

    sec = {}

    # 1. coverage matrix
    L = ["# Ω Coverage Matrix", "", f"_{spec['organization']} · {spec['industry']} · {ts}_", "",
         "| Threat | Severity | Status | Ω coverage |", "|---|---|---|---|"]
    icon = {"COVERED": "🟢 Covered", "PARTIAL": "🟡 Partial", "UNCOVERED": "🔴 Uncovered", "UNKNOWN": "⚪ Unknown"}
    for r in rows:
        L.append(f"| {r['name']} | {r['severity']} | {icon[r['status']]} | "
                 f"{', '.join(f'`{x}`' for x in r['rules']) or '—'} |")
    sec["matrix"] = "\n".join(L)

    # 2. gap analysis
    L = ["# Coverage Gaps", ""]
    for label, group in (("Covered", covered), ("Partially covered", partial), ("Uncovered", uncovered)):
        L.append(f"## {label} ({len(group)})")
        if not group:
            L.append("- none")
        for r in group:
            tail = f" — {r['reason']}" if r["reason"] else (f" → {', '.join(r['rules'])}" if r["rules"] else "")
            L.append(f"- **{r['name']}**{tail}")
        L.append("")
    sec["gaps"] = "\n".join(L)

    # 3. recommended Ω extensions
    L = ["# Recommended Ω Extensions", ""]
    if gap_threats:
        L += [f"{len(gap_threats)} threat(s) need new or domain-specific Ω. Onboard them as a `{spec['industry']}` "
              f"Ω registry (geometry unchanged, Ω expands):", "",
              "- **Suggested Ω domain:** `" + spec["industry"] + "`",
              "- **Suggested control tools:** " + (", ".join(f"`{t}`" for t in onboard_spec["tools"])),
              "- **Suggested rules:** one deny-by-default Ω per control tool + the reusable cross-domain patterns",
              "- **Suggested corpus tests / evaluation cases:** BLOCK (tool, no auth) + PERMIT (tool, authorized) per tool, plus reused-pattern probes",
              "", "Generate the onboarding package:", "",
              f"```bash\npython .claude/skills/onboard-sector/scripts/onboard_sector.py {spec['industry']} \\\n"
              f"  --spec threat-model/onboard-spec-{spec['industry']}.json\n```"]
    else:
        L.append("No uncovered threats — existing Ω covers the submitted threat model. Proceed to pilot + audit pack.")
    sec["extensions"] = "\n".join(L)

    # 4. pilot scope
    cov_names = ", ".join(r["name"] for r in covered) or "the submitted threats"
    L = ["# Pilot Scope", "",
         f"**Objective:** demonstrate pre-execution governance over {spec['organization']}'s "
         f"{spec['industry']} agent — blocking unsafe trajectories ({cov_names}) before any tool executes.",
         "",
         "**Success criteria:**",
         "- 0 false negatives / 0 false positives on the pilot corpus (precision = recall = 1.0).",
         "- Sub-millisecond per-evaluation governance latency.",
         "- Every decision attested (engine commit + ruleset hash) and replayable; tamper-evident audit trail.",
         "",
         "**Required integrations:** governance middleware in front of these tools — "
         + (", ".join(f"`{t}`" for t in spec["tool_inventory"]) or "the agent's tool calls") + ".",
         "",
         "**Protected assets:** " + (", ".join(spec["critical_assets"]) or "(to confirm)") + ".",
         "",
         "**Expected risk reduction:** the covered threats become deny-before-execution; "
         f"{len(uncovered)} gap(s) closed by onboarding a `{spec['industry']}` Ω registry.",
         "",
         "**Evaluation plan:**",
         "1. Load the pilot Ω (existing coverage + onboarded gaps).",
         "2. Run the labelled corpus → confirm 0 FP / 0 FN.",
         "3. Replay sample verdicts → bit-identical; tamper detected.",
         "4. Benchmark latency on target hardware.",
         "5. Produce the evidence pack: `python .claude/skills/generate-audit-pack/scripts/generate_audit_pack.py "
         f"--customer \"{spec['organization']}\"`."]
    sec["pilot"] = "\n".join(L)

    # 5. executive summary (non-technical)
    ttv = ("days — most threats are already governed by live Ω rules; the pilot can show pre-execution blocks immediately"
           if pct >= 60 else
           "1–2 weeks — core coverage is live; the remaining gaps are onboarded as new Ω rules (typically under a day each)")
    crit = [r["name"] for r in uncovered if r["severity"] in ("high", "critical")] or [r["name"] for r in uncovered]
    L = ["# Executive Summary", "",
         f"**{spec['organization']} — {spec['industry'].title()} agent governance assessment**", "",
         f"- **Current Ω coverage:** ~{pct}% of submitted threats ({len(covered)} covered, "
         f"{len(partial)} partial, {len(uncovered)} uncovered).",
         f"- **Critical gaps:** {', '.join(crit) if crit else 'none — existing Ω covers the model'}.",
         f"- **Highest-risk trajectories (now blockable pre-execution):** "
         f"{', '.join(r['name'] for r in covered[:5]) or '—'}.",
         f"- **Recommended pilot:** govern the {spec['industry']} agent with the live Ω registry"
         + (f", onboarding {len(uncovered)} gap rule(s)." if uncovered else "."),
         f"- **Estimated time-to-value:** {ttv}.",
         "",
         "_Runtime Governance evaluates the agent's proposed actions and blocks unsafe ones before they run — "
         "the time cost is typically negligible next to model inference and tool execution._"]
    sec["exec"] = "\n".join(L)

    combined = "\n\n---\n\n".join([sec["exec"], sec["matrix"], sec["gaps"], sec["extensions"], sec["pilot"]])

    js = {
        "schema": "morrison-threat-mapping/1",
        "generated_utc": ts,
        "organization": spec["organization"],
        "industry": spec["industry"],
        "engine": engine_meta,
        "coverage_pct": pct,
        "summary": {"covered": len(covered), "partial": len(partial), "uncovered": len(uncovered), "total": len(rows)},
        "matrix": rows,
        "onboard_spec": onboard_spec,
        "handoff": {
            "onboard_sector": f"python .claude/skills/onboard-sector/scripts/onboard_sector.py {spec['industry']} --spec threat-model/onboard-spec-{spec['industry']}.json",
            "generate_audit_pack": f"python .claude/skills/generate-audit-pack/scripts/generate_audit_pack.py --customer \"{spec['organization']}\"",
        },
    }
    sec["combined"] = combined
    sec["onboard_spec"] = onboard_spec
    return sec, js


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", default=None)
    ap.add_argument("--org", default=None)
    ap.add_argument("--industry", default=None)
    ap.add_argument("--arch", default=None)
    ap.add_argument("--tools", default="")
    ap.add_argument("--assets", default="")
    ap.add_argument("--threats", default="")
    ap.add_argument("--regs", default="")
    ap.add_argument("--controls", default="")
    ap.add_argument("--out", default=None)
    ap.add_argument("--engine", default=None)
    a = ap.parse_args()

    root = vp.repo_root()
    engine = vp.resolve_engine(root, a.engine)
    spec = load_spec(a)
    cat = build_catalog(engine)
    engine_meta = {"source": engine, "engine_ref": vp.engine_ref(root),
                   "catalog_rules": (len(cat) if cat else 0)}
    sec, js = build(spec, cat, engine_meta)

    out = a.out or os.path.join(root, "threat-model")
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, "omega-coverage-matrix.md"), "w").write(sec["matrix"])
    open(os.path.join(out, "gap-analysis.md"), "w").write(sec["gaps"])
    open(os.path.join(out, "recommended-omega-extensions.md"), "w").write(sec["extensions"])
    open(os.path.join(out, "pilot-scope.md"), "w").write(sec["pilot"])
    open(os.path.join(out, "executive-summary.md"), "w").write(sec["exec"])
    open(os.path.join(out, "threat-model-report.md"), "w").write(sec["combined"])
    open(os.path.join(out, "threat-mapping.json"), "w").write(json.dumps(js, indent=2))
    open(os.path.join(out, f"onboard-spec-{spec['industry']}.json"), "w").write(json.dumps(sec["onboard_spec"], indent=2))

    print(sec["exec"])
    print(f"\ncatalog: {engine_meta['catalog_rules']} Ω rules · coverage ~{js['coverage_pct']}% "
          f"({js['summary']['covered']} covered / {js['summary']['partial']} partial / {js['summary']['uncovered']} uncovered)")
    print(f"wrote {out}/ (matrix, gaps, extensions, pilot, exec, report, json, onboard-spec)")
    print("\nHand off:")
    print("  " + js["handoff"]["onboard_sector"])
    print("  " + js["handoff"]["generate_audit_pack"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
