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
