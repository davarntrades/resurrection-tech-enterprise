/* ============================================================================
 * Operations Agent — AI reasoning layer (the "Reason → Propose" step).
 *
 * The LLM NEVER executes anything. It sees the structured observation snapshot
 * and returns structured recommendations only:
 *
 *   { decision: "<action_id>", confidence: 0..1, reason: "...",
 *     org_id?: "...", params?: {...} }
 *
 * Every recommendation is validated against the action catalog before it can
 * become a proposal, and every proposal still passes Runtime Governance before
 * execution — a hallucinated or hostile recommendation is contained twice.
 *
 * Uses the Anthropic Messages API via plain fetch (house zero-dependency
 * style, mirroring lib/runtime/engine.js) with structured outputs
 * (output_config.format json_schema) so the reply is guaranteed-shape JSON.
 * Without ANTHROPIC_API_KEY the deterministic rule-based fallback produces the
 * same recommendation shape, so the pipeline runs identically in dev/CI.
 *
 * Config: ANTHROPIC_API_KEY (optional) · OPS_REASONING_MODEL (default
 * claude-opus-4-8) · OPS_LLM_TIMEOUT_MS (default 30000)
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const actions = require("./actions");

const MODEL = () => process.env.OPS_REASONING_MODEL || "claude-opus-4-8";
const TIMEOUT_MS = Number(process.env.OPS_LLM_TIMEOUT_MS || 30000);

const RECOMMENDATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["recommendations"],
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["decision", "confidence", "reason"],
        properties: {
          decision: { type: "string", description: "an action id from the catalog" },
          confidence: { type: "number" },
          reason: { type: "string" },
          org_id: { type: ["string", "null"] },
          params: { type: "object", additionalProperties: true },
        },
      },
    },
  },
};

/** Validate + clamp one raw recommendation. Returns null if unusable. */
function validate(rec) {
  if (!rec || typeof rec !== "object") return null;
  const action = actions.get(String(rec.decision || ""));
  if (!action) return null; // unknown action → dropped (deny-by-default)
  const confidence = Math.max(0, Math.min(1, Number(rec.confidence)));
  if (!Number.isFinite(confidence)) return null;
  return {
    decision: String(rec.decision),
    confidence,
    reason: String(rec.reason || "").slice(0, 2000),
    org_id: rec.org_id ? String(rec.org_id) : null,
    params: rec.params && typeof rec.params === "object" ? rec.params : {},
  };
}

// ── Deterministic fallback: observation → recommendation mapping ─────────────
function heuristics(snapshot) {
  const recs = [];
  for (const o of snapshot.observations || []) {
    if (o.kind === "customers.stalled") {
      recs.push({
        decision: "create_recommendation", confidence: 0.8, org_id: o.org_id,
        reason: `Stalled customer journey: ${o.summary}. Raise a tracked recommendation so the operator re-engages.`,
        params: { org_id: o.org_id, title: "Customer journey stalled — re-engage", detail: o.summary, severity: "medium" },
      });
    } else if (o.kind === "runtime.engine_unavailable" || (o.kind.startsWith("integration.") && o.severity === "critical")) {
      recs.push({
        decision: "raise_alert", confidence: 0.95, org_id: o.org_id || null,
        reason: `Critical availability signal: ${o.summary}`,
        params: { org_id: o.org_id || null, kind: o.kind.replace(/\./g, "_"), severity: "critical", message: o.summary },
      });
    } else if (o.kind === "runtime.blocked" && (o.data.counts && o.data.counts.BLOCK >= 5)) {
      recs.push({
        decision: "notify_operator", confidence: 0.85, org_id: o.org_id,
        reason: `Elevated BLOCK volume: ${o.summary}. Operator should review the customer's decision log.`,
        params: { org_id: o.org_id, message: o.summary },
      });
    } else if (o.kind === "store.non_durable") {
      recs.push({
        decision: "notify_operator", confidence: 0.9, org_id: null,
        reason: "Evidence durability risk: platform is on the non-durable file store.",
        params: { message: o.summary },
      });
    }
  }
  return recs;
}

// ── LLM path (structured outputs; fail-soft to heuristics) ───────────────────
const SYSTEM = `You are the reasoning layer of Resurrection Tech's internal Operations Agent for the Runtime Governance platform. You NEVER execute actions. You analyse the observation snapshot and return recommendations only. Every recommendation is evaluated by the Runtime Governance engine before any execution, and high-risk actions additionally require operator approval — so recommend what genuinely helps operations, and let governance decide. Only use action ids from the provided catalog. Prefer few, high-value recommendations over many. Confidence is your honest estimate in [0,1].`;

async function callClaude(snapshot) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL(),
        max_tokens: 4096,
        system: SYSTEM,
        output_config: { format: { type: "json_schema", schema: RECOMMENDATION_SCHEMA } },
        messages: [{
          role: "user",
          content:
            `Action catalog (id · risk · title):\n${actions.list().map((a) => `- ${a.id} · ${a.risk} · ${a.title}${a.refuse ? " (never executed — do not recommend)" : ""}`).join("\n")}\n\n` +
            `Observation snapshot:\n${JSON.stringify(snapshot, null, 2)}\n\n` +
            `Return your recommendations.`,
        }],
      }),
    });
    if (!res.ok) { rt.log.warn("ops_llm_http_error", { status: res.status }); return null; }
    const body = await res.json();
    if (body.stop_reason === "refusal") { rt.log.warn("ops_llm_refusal", {}); return null; }
    const text = (body.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.recommendations) ? parsed.recommendations : null;
  } catch (e) {
    rt.log.warn("ops_llm_failed", { error: e.message });
    return null;
  } finally { clearTimeout(t); }
}

/**
 * Produce validated recommendations for a snapshot.
 * Returns { source: "llm"|"heuristic", recommendations: [...] }.
 */
async function recommend(snapshot) {
  const raw = await callClaude(snapshot);
  const source = raw ? "llm" : "heuristic";
  const candidates = raw || heuristics(snapshot);
  const recommendations = candidates.map(validate).filter(Boolean);
  return { source, recommendations };
}

module.exports = { recommend, validate, heuristics, RECOMMENDATION_SCHEMA };
