/* ============================================================================
 * Operations Agent — briefing interaction router ("Morning." → briefing).
 *
 * A deliberately RESTRICTED natural-language surface: prompts are matched to a
 * fixed registry of operational intents, each answered exclusively from
 * authorised Operations API data (the same grounded payloads the dashboard
 * uses). This is NOT an open chatbot —
 *   · no free-form generation: answers are assembled from records;
 *   · no execution path: intents are read-only (approvals stay on the
 *     operator-authenticated proposals endpoint);
 *   · unknown prompts return the supported-intent list, nothing else.
 *
 * Matching is deterministic (keyword rules, first match wins). The registry is
 * data, so future intents extend the table — not the trust model.
 * ============================================================================ */
"use strict";
const briefingMod = require("./briefing");
const proposals = require("./proposals");
const evidence = require("./evidence");
const systemsMod = require("./systems");
const intelligence = require("./intelligence");
const workflow = require("./workflow");
const agentsMod = require("./agents");

const DAY = 86400000;

// ── Intent registry: [id, matcher, handler] — first match wins ──────────────
const INTENTS = [
  {
    id: "briefing",
    description: "The current operational briefing (\"Morning.\", \"Good morning\", \"brief me\")",
    match: (p) => /^(good\s+)?(morning|afternoon|evening)\b|^brief(ing)?\b|daily brief|operational brief/.test(p),
    handler: async () => {
      const b = await briefingMod.briefing();
      return { kind: "briefing", briefing: b, text: b.text };
    },
  },
  {
    id: "attention",
    description: "What needs attention / today's priorities (\"What needs my attention?\", \"Prepare today's priorities\")",
    match: (p) => /attention|priorit|what.*(today|now|next)|to.?do/.test(p),
    handler: async () => {
      const b = await briefingMod.briefing();
      const urgent = b.items.filter((i) => ["critical", "warning"].includes(i.severity));
      return {
        kind: "priorities",
        items: urgent,
        recommended_actions: b.recommended_actions,
        text: b.recommended_actions.length
          ? `${b.recommended_actions.length} recommended action(s):\n` + b.recommended_actions.map((r) => `${r.priority}. ${r.title} — ${r.reason}`).join("\n")
          : "No immediate actions require your attention.",
      };
    },
  },
  {
    id: "explain_recommendations",
    description: "Explain today's recommendations (\"Explain today's recommendations\", \"why these\")",
    match: (p) => /explain.*(recommend|priorit)|why (these|this|that)|justif/.test(p),
    handler: async () => {
      const b = await briefingMod.briefing();
      return {
        kind: "explanation",
        top_priority: b.top_priority,
        recommended_actions: b.recommended_actions,
        text: b.recommended_actions.length
          ? (b.top_priority ? `Top priority: ${b.top_priority.org ? b.top_priority.org + " — " : ""}${b.top_priority.title} (confidence ${Math.round(b.top_priority.confidence * 100)}%; ${b.top_priority.confidence_basis}).\n` : "")
            + b.recommended_actions.map((r) => `${r.priority}. ${r.title} — impact ${r.impact} [${r.severity}${r.impact_inputs && r.impact_inputs.health != null ? `, health ${r.impact_inputs.health}` : ""}${r.impact_inputs && r.impact_inputs.business_value ? `, value ${r.impact_inputs.business_value}` : ""}] — ${r.reason}`).join("\n")
          : "No recommendations to explain — nothing requires attention.",
      };
    },
  },
  {
    id: "customers",
    description: "Customer intelligence (\"Customer health\", \"Who needs follow-up?\", \"How is <org>?\", \"Who is at risk?\")",
    // Pilot-specific phrasing falls through to the dedicated pilot_ready intent.
    match: (p) => !/pilot/.test(p) && /customer|organisation|\borg\b|health score|at risk|needs? (follow|attention)|who.*(risk|follow|attention)|how is |how's /.test(p),
    handler: async (p) => {
      const rows = await intelligence.list();
      // Named org? Return that one's profile line + next recommendation.
      const named = rows.find((r) => r.name && p.includes(r.name.toLowerCase()));
      if (named) {
        return { kind: "customer", customer: named, evidenceUrl: `/admin/operations?view=customers&org=${named.org_id}`,
          text: `${named.name} — health ${named.scores.health.score}/100 (${named.scores.health.band}); pilot readiness ${named.scores.pilot_readiness.score} (${named.scores.pilot_readiness.band}); runtime risk ${named.scores.runtime_risk.score} (${named.scores.runtime_risk.band}); engagement ${named.scores.engagement.score}. Integration: ${named.integration_status.status}. Next: ${named.next_recommendation.title}.` };
      }
      const atRisk = rows.filter((r) => r.scores.health.band === "at_risk" || r.stalled);
      const pool = /ready/.test(p) ? rows.filter((r) => r.scores.pilot_readiness.band === "ready") : (/at risk|risk|follow|attention/.test(p) ? atRisk : rows);
      return { kind: "customers", customers: pool, evidenceUrl: "/admin/operations?view=customers",
        text: pool.length
          ? pool.map((r) => `• ${r.name}: health ${r.scores.health.score} (${r.scores.health.band}), pilot ${r.scores.pilot_readiness.score} (${r.scores.pilot_readiness.band}) — ${r.next_recommendation.title}`).join("\n")
          : "No customers match that query." };
    },
  },
  {
    id: "lifecycle",
    description: "Lifecycle / stage progress (\"Where is <org> in the lifecycle?\", \"What's the next governed action for <org>?\", \"Lifecycle overview\")",
    match: (p) => /lifecycle|state machine|what stage|which stage|next (governed )?(action|step|transition)|advance|where is .* in/.test(p),
    handler: async (p) => {
      const orgs = await intelligence.list();
      const named = orgs.find((o) => o.name && p.includes(o.name.toLowerCase()));
      if (named) {
        const st = await workflow.state(named.org_id);
        return { kind: "lifecycle", state: st, evidenceUrl: `/admin/operations?view=customers&org=${named.org_id}`,
          text: `${named.name} — stage: ${st.current_label} (${st.derivation}). Completed: ${st.completed.length ? st.completed.join(" → ") : "none"}. Next governed action: ${st.next_action.title}${st.next_action.action_id ? ` (${st.next_action.requires_approval ? "requires approval" : "auto after PERMIT"})` : ""}.` };
      }
      const sum = await workflow.summary();
      return { kind: "lifecycle_summary", summary: sum, evidenceUrl: "/admin/operations?view=customers",
        text: `Lifecycle: ${Object.entries(sum.by_stage).filter(([, n]) => n).map(([s, n]) => `${s} ${n}`).join(", ") || "no organisations"}. ${sum.next_actions.length} next governed action(s) available.` };
    },
  },
  {
    id: "agents",
    description: "Multi-agent core (\"Which agent owns this?\", \"What is the Sales agent doing?\", \"Show the agent council\", \"agent workload\")",
    match: (p) => /\bcouncil\b|multi.?agent|which agent|who owns|agent workload|(sales|compliance|finance|deployment|customer success|customer-success) agent|what.*(agent).*(doing|proposing|working)/.test(p),
    handler: async (p) => {
      const roster = await agentsMod.roster();
      const named = roster.agents.find((a) => p.includes(a.id.replace(/_/g, " ")) || p.includes(a.title.toLowerCase()) || (a.id === "customer_success" && /customer success|customer-success/.test(p)));
      if (named) {
        return { kind: "agent", agent: named, evidenceUrl: "/admin/operations?view=agents",
          text: `${named.title} — ${named.mandate}\nCharter: ${named.charter.actions.map((a) => a.id).join(", ")}. Owns lifecycle stages: ${named.charter.stages.length ? named.charter.stages.join(", ") : "cross-cutting (no transition ownership)"}.\nWorkload: ${named.workload.total} proposal(s) — ${named.workload.escalated} awaiting approval, ${named.workload.executed} executed.` };
      }
      return { kind: "agents", roster, evidenceUrl: "/admin/operations?view=agents",
        text: roster.agents.map((a) => `• ${a.title}: ${a.workload.total} proposal(s) (${a.workload.escalated} awaiting approval, ${a.workload.executed} executed) — ${a.charter.actions.length} chartered action(s)`).join("\n") };
    },
  },
  {
    id: "pipeline",
    description: "Enterprise pipeline summary (\"Summarise enterprise pipeline\", \"board report\")",
    match: (p) => /pipeline|board report|forecast|summar(y|ise|ize).*(pipeline|enterprise|customers)/.test(p),
    handler: async () => {
      const rows = await intelligence.list();
      const byStage = {};
      for (const r of rows) byStage[r.stage] = (byStage[r.stage] || 0) + 1;
      const ready = rows.filter((r) => r.scores.pilot_readiness.band === "ready").length;
      const atRisk = rows.filter((r) => r.scores.health.band === "at_risk" || r.stalled).length;
      return { kind: "pipeline", total: rows.length, by_stage: byStage, pilot_ready: ready, at_risk: atRisk, customers: rows, evidenceUrl: "/admin/operations?view=customers",
        text: `${rows.length} organisation(s). Stages: ${Object.entries(byStage).map(([s, n]) => `${s} ${n}`).join(", ") || "none"}. Pilot-ready: ${ready}. At-risk/stalled: ${atRisk}.` };
    },
  },
  {
    id: "blocked",
    description: "Blocked actions (\"Show blocked actions\")",
    match: (p) => /blocked|violation|denied action/.test(p),
    handler: async () => {
      const rows = await evidence.search({ verdict: "block", since: new Date(Date.now() - 7 * DAY).toISOString(), limit: 50 });
      return {
        kind: "blocked", evidence: rows, evidenceUrl: "/admin/operations?view=blocked",
        text: rows.length
          ? `${rows.length} blocked action(s) in the last 7 days:\n` + rows.slice(0, 10).map((b) => `• ${b.action_id} — ${b.rule || b.policy} (${b.created_at})`).join("\n")
          : "No blocked actions in the last 7 days.",
      };
    },
  },
  {
    id: "approvals",
    description: "Pending approvals (\"What is awaiting approval?\")",
    match: (p) => /approv|awaiting|pending action|sign.?off|escalat/.test(p),
    handler: async () => {
      const rows = await proposals.list({ status: "escalated", limit: 50 });
      return {
        kind: "approvals", proposals: rows, evidenceUrl: "/admin/operations?view=approvals",
        text: rows.length
          ? `${rows.length} action(s) awaiting your approval:\n` + rows.map((p) => `• ${p.action_id} (${p.risk}) — ${p.reasoning?.reason || p.decision?.reason || ""}`).join("\n")
          : "Nothing is awaiting approval.",
      };
    },
  },
  {
    id: "system_health",
    description: "System / integration health (\"Why is Railway unhealthy?\", \"Is the engine up?\")",
    match: (p) => /railway|vercel|github|supabase|engine|health|status|unhealthy|down\b|worker|openclaw|llm/.test(p),
    handler: async (p) => {
      const board = await systemsMod.statusBoard();
      const named = board.systems.filter((s) => p.includes(s.component.replace("_", " ")) || p.includes(s.component) || (s.component === "runtime_governance" && /engine|governance/.test(p)));
      const show = named.length ? named : board.systems;
      return {
        kind: "systems", mode: board.mode, systems: show, evidenceUrl: "/admin/operations?view=systems",
        text: show.map((s) => `• ${s.component}: ${s.status} — ${s.detail}`).join("\n"),
      };
    },
  },
  {
    id: "pilot_ready",
    description: "Pilot readiness (\"Which organisation is ready for a pilot?\")",
    match: (p) => /pilot/.test(p),
    handler: async () => {
      const b = await briefingMod.briefing();
      const it = b.items.find((i) => i.id === "pilots.ready");
      return { kind: "pilot_ready", item: it, evidenceUrl: it?.evidenceUrl, text: it?.message || "No pilot-readiness data." };
    },
  },
];

/** Route a prompt to an intent. Returns {ok, intent, ...payload} or the
 *  supported-intent list for unknown prompts. Read-only by construction. */
async function ask(prompt) {
  const p = String(prompt || "").toLowerCase().trim().slice(0, 500);
  if (!p) return { ok: false, error: "empty prompt", supported: INTENTS.map((i) => ({ id: i.id, description: i.description })) };
  for (const intent of INTENTS) {
    if (intent.match(p)) {
      const payload = await intent.handler(p);
      return { ok: true, intent: intent.id, asked: p, answered_at: new Date().toISOString(), ...payload };
    }
  }
  return {
    ok: false, intent: null, asked: p,
    error: "I only answer operational questions from authorised data.",
    supported: INTENTS.map((i) => ({ id: i.id, description: i.description })),
    text: "I can answer:\n" + INTENTS.map((i) => `• ${i.description}`).join("\n"),
  };
}

module.exports = { ask, INTENTS };
