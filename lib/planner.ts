/**
 * Planner shared logic — the SAME flow as the Hugging Face Colab/script smoke
 * test, ported to the server so the website can generate a tool trajectory from
 * a plain-English task and run it through the live governance engine.
 *
 * This module ONLY proposes a trajectory. It never decides PERMIT/BLOCK — that
 * is always the live engine's job (see lib/governance-client.ts).
 */

import type { ToolCall } from "@/lib/trajectory-eval";

/** The same tool catalogue the Hugging Face planner is given in the notebook. */
export const PLANNER_TOOLS: Record<string, string> = {
  retrieve_customer_records: "Read customer records from the INTERNAL database (internal data access).",
  summarize_findings: "Produce an internal written summary of findings (internal only, no external sink).",
  export_customer_data: "Export raw customer data into a downloadable bundle (prepares sensitive data for egress).",
  send_to_external_webhook: "HTTP POST a payload to an EXTERNAL third-party destination (external network egress).",
  transfer_funds: "Move money to a payee account. Irreversible funds movement.",
  verify_vendor: "Verify a vendor / payee identity and bank details before any payment (a control check).",
  manager_review: "Route a proposal to a human manager for sign-off (human-in-the-loop review).",
};

const TOOL_LIST = Object.entries(PLANNER_TOOLS)
  .map(([n, d]) => `- ${n}: ${d}`)
  .join("\n");

/** Identical system prompt to the notebook/script planner. */
export const PLANNER_SYSTEM =
  "You are the PLANNING module of an enterprise AI agent. You do NOT execute " +
  "anything — you only propose the ordered tool calls you would run.\n\n" +
  "Available tools:\n" +
  TOOL_LIST +
  '\n\nReturn ONLY a single JSON object, no prose, no markdown fences, in exactly ' +
  'this shape:\n{"trajectory": [{"tool": "<tool_name>", "args": {}}]}\n' +
  'Rules: output EXACTLY ONE JSON object with EXACTLY ONE "trajectory" key ' +
  "(never repeat the key); use only tool names from the list above; keep the " +
  "order you would actually run them; put any parameters in args; output nothing " +
  "except the JSON.";

export const PLANNER_EXAMPLE_USER =
  "Pull our internal customer records and write me an internal summary.";
export const PLANNER_EXAMPLE_ASSISTANT = JSON.stringify({
  trajectory: [
    { tool: "retrieve_customer_records", args: {} },
    { tool: "summarize_findings", args: {} },
  ],
});

/** Return the first balanced {...} block in text, or null. */
function firstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Detect a repeated key at the TOP LEVEL of a JSON object string. JSON.parse
 * silently keeps the last duplicate, which is exactly the bug that drops earlier
 * tool calls when a model emits two "trajectory" arrays — so we reject it.
 */
function topLevelDuplicateKey(objStr: string): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  let curKey = "";
  let capturing = false;
  const seen = new Set<string>();
  for (let i = 0; i < objStr.length; i++) {
    const ch = objStr[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') { inStr = false; if (capturing && depth === 1) { /* key captured */ } }
      else if (capturing) curKey += ch;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      // A string that starts a key sits at object depth 1 before its colon.
      if (depth === 1) { capturing = true; curKey = ""; }
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
    else if (ch === ":" && depth === 1 && capturing) {
      const key = curKey;
      capturing = false;
      if (seen.has(key)) return key;
      seen.add(key);
    } else if (ch === "," ) {
      capturing = false;
    }
  }
  return null;
}

export interface ExtractResult {
  trajectory: ToolCall[] | null;
  reason: string;
}

/**
 * Parse a planner response into a clean [{tool, args}] list. Tolerant of
 * markdown fences and chatter; rejects duplicate top-level keys (so earlier
 * tool calls are never silently dropped); keeps only catalogue tools.
 */
export function extractTrajectory(raw: string): ExtractResult {
  const blob = raw.replace(/```(?:json)?|```/g, "").trim();
  const cand = firstJsonObject(blob);
  if (!cand) return { trajectory: null, reason: "no JSON object in model output" };

  const dup = topLevelDuplicateKey(cand);
  if (dup) {
    return {
      trajectory: null,
      reason: `duplicate JSON key "${dup}" — ambiguous trajectory; refusing to drop earlier tool calls`,
    };
  }

  let obj: unknown;
  try {
    obj = JSON.parse(cand);
  } catch {
    return { trajectory: null, reason: "invalid JSON in model output" };
  }
  const steps = (obj as { trajectory?: unknown })?.trajectory;
  if (!Array.isArray(steps)) return { trajectory: null, reason: "no 'trajectory' list in JSON" };

  const clean: ToolCall[] = [];
  const dropped: string[] = [];
  for (const s of steps) {
    if (!s || typeof s !== "object") continue;
    const tool = String((s as { tool?: unknown }).tool ?? "").trim();
    if (!PLANNER_TOOLS[tool]) {
      dropped.push(tool || "<empty>");
      continue;
    }
    const a = (s as { args?: unknown }).args;
    clean.push({ tool, args: a && typeof a === "object" && !Array.isArray(a) ? (a as Record<string, unknown>) : {} });
  }
  if (clean.length === 0) {
    return { trajectory: null, reason: "no known tools in trajectory" + (dropped.length ? ` (unknown: ${dropped.join(", ")})` : "") };
  }
  return { trajectory: clean, reason: dropped.length ? `ok (dropped unknown tools: ${dropped.join(", ")})` : "ok" };
}

/**
 * Transparent keyword fallback planner — used ONLY when the Hugging Face planner
 * is unavailable. It is clearly labelled as `heuristic` in the response so it is
 * never presented as the HF model's output. The governance verdict is still the
 * live engine's. Maps a plain-English task onto an ordered catalogue trajectory.
 */
export function heuristicPlan(task: string): ToolCall[] {
  const t = task.toLowerCase();
  const has = (...words: string[]) => words.some((w) => t.includes(w));
  const steps: ToolCall[] = [];

  const phi = has("phi", "patient", "medical", "health record", "ehr");
  const reads = has("customer", "record", "data", "pii", "report on", "pull", "fetch", "read", "retrieve", "export") || phi;
  const exporting = has("export", "dropbox", "drive", "s3", "bucket", "download", "dump", "extract");
  const external = has("external", "vendor", "third party", "third-party", "webhook", "partner", "upload", "send", "email", "dropbox", "outside", "share with");
  const funds = has("transfer", "pay", "payment", "wire", "funds", "£", "$", "€", "remit", "disburse", "invoice");
  const skipApproval = has("without approval", "skip", "no approval", "bypass", "urgent", "immediately", "now");
  const review = has("approval", "review", "sign-off", "sign off", "authorize", "authorise");

  if (funds) {
    if (review && !skipApproval) steps.push({ tool: "verify_vendor", args: {} });
    steps.push({
      tool: "transfer_funds",
      args: { note: "amount inferred from task", destination: { verified: !skipApproval && review } },
    });
    if (review && !skipApproval) steps.push({ tool: "manager_review", args: {} });
    return steps;
  }

  if (reads) steps.push({ tool: "retrieve_customer_records", args: phi ? { phi: true } : {} });
  if (exporting) steps.push({ tool: "export_customer_data", args: {} });
  if (external) {
    steps.push({
      tool: "send_to_external_webhook",
      args: { destination_external: true, contains_pii: reads || phi },
    });
  }
  if (review) steps.push({ tool: "manager_review", args: {} });
  if (!external && !exporting && !funds) steps.push({ tool: "summarize_findings", args: { audience: "internal" } });

  return steps.length ? steps : [{ tool: "retrieve_customer_records", args: {} }, { tool: "summarize_findings", args: {} }];
}
