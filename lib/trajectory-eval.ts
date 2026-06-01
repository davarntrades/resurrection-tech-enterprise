/**
 * Public demo trajectory evaluator.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THIS IS A SIMPLIFIED, PUBLIC CONCEPT DEMONSTRATION ONLY.
 *
 * It mimics the *shape* of a Morrison Runtime Governance verdict — evaluating a
 * proposed tool-call trajectory for reachable forbidden states (Ω) BEFORE
 * execution — using a small set of heuristic rules. It is intentionally NOT the
 * enterprise evaluator and exposes none of the core governance logic.
 *
 * TODO: Replace this demo evaluator with a call to the Morrison Runtime
 * Governance service / package / deployed microservice.
 * Core repo: https://github.com/davarntrades/Morrison-Runtime-Governance
 *
 * Integration seam: keep the `evaluateTrajectory(steps): EvalResult` signature
 * stable. A future implementation can `await fetch(GOVERNANCE_API, …)` here and
 * map the response onto EvalResult without any change to the API route or UI.
 *
 * SAFETY: this function never executes a tool call. It only inspects JSON.
 * ──────────────────────────────────────────────────────────────────────────
 */

export interface ToolCall {
  tool: string;
  args?: Record<string, unknown>;
}

export type Verdict = "PERMIT" | "BLOCK";

export interface StepSummary {
  index: number;
  tool: string;
  summary: string;
}

export interface EvalResult {
  verdict: Verdict;
  /** Governance layer that produced the verdict. V1 = single-step action, V2 = source→sink chain, none = permitted. */
  layer: string;
  reason: string;
  /** Forbidden-state identifier reached, or "not reached". */
  omega: string;
  runtimeStatus: string;
  steps: StepSummary[];
}

/* ── Heuristics ─────────────────────────────────────────────────────────── */

// Hosts considered inside the approved boundary (not an external sink).
const INTERNAL_HOST =
  /(^localhost$)|(^127\.)|(^10\.)|(^192\.168\.)|(^172\.(1[6-9]|2\d|3[01])\.)|(\.local$)|(\.internal$)|(\.intranet$)|(intranet)|(\.corp$)|(company\.local)/i;

const DATA_SOURCE_TOOLS = /^(read_file|read|get_file|fetch_file|query_db|db_query|read_database|export_data|list_files|cat|load)$/i;
const CRED_TOOLS = /^(read_secret|get_secret|get_credentials|read_env|get_env|read_keychain|vault_read)$/i;
const SINK_TOOLS = /^(http_request|http|https|fetch|request|upload|post|put|webhook|send|curl|send_email|email|sftp|s3_put)$/i;
const SHELL_TOOLS = /^(shell|exec|bash|sh|run|run_command|command|spawn|system|subprocess|os_system)$/i;
const TRANSFER_TOOLS = /^(transfer|wire|wire_transfer|payment|pay|send_funds|move_funds|ach|swift)$/i;

// Dangerous shell patterns.
const DANGEROUS_CMD =
  /(rm\s+-rf|:\(\)\s*\{|mkfs|dd\s+if=|>\s*\/dev\/sd|chmod\s+777|chmod\s+-R\s+777|curl[^|]*\|\s*(sh|bash)|wget[^|]*\|\s*(sh|bash)|base64\s+-d[^|]*\|\s*(sh|bash)|nc\s+-e|\/etc\/passwd|\/etc\/shadow|sudo\s|del\s+\/f|format\s+c:)/i;

// Path traversal / sensitive absolute paths.
const PATH_TRAVERSAL = /(\.\.\/)|(\.\.\\)|(^\/etc\/)|(^\/root\/)|(\/\.ssh\/)|(id_rsa)|(^\/proc\/)|(^\/sys\/)/i;

// Credential-ish path or argument signals.
const CRED_SIGNAL = /(secret|credential|\.env|password|passwd|api[_-]?key|token|private[_-]?key|id_rsa|\.pem|access[_-]?key)/i;

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
}

function urlOf(args: Record<string, unknown>): string {
  return str(args.url ?? args.endpoint ?? args.destination ?? args.host ?? args.uri ?? args.to);
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    // Bare host or relative — strip scheme/path heuristically.
    const m = url.replace(/^[a-z]+:\/\//i, "").split(/[/?#]/)[0];
    return m || url;
  }
}

function isExternalSink(tool: string, args: Record<string, unknown>): boolean {
  if (!SINK_TOOLS.test(tool)) return false;
  const url = urlOf(args);
  if (!url) return false;
  const host = hostname(url);
  if (!host) return false;
  return !INTERNAL_HOST.test(host);
}

function argText(args: Record<string, unknown>): string {
  return Object.values(args).map(str).join(" ");
}

function isUnauthorisedRecipient(args: Record<string, unknown>): boolean {
  // Explicit verification flag.
  const dest = args.destination ?? args.recipient ?? args.to ?? args.account;
  if (dest && typeof dest === "object") {
    const v = (dest as Record<string, unknown>).verified;
    if (v === false) return true;
    const approved = (dest as Record<string, unknown>).approved;
    if (approved === false) return true;
  }
  const text = argText(args);
  if (/verified["\s:]+false|approved["\s:]+false/i.test(text)) return true;
  return /(unapprov|unauthoris|unauthoriz|unknown\s+account|external\s+account)/i.test(text);
}

/* ── Evaluator ──────────────────────────────────────────────────────────── */

const PERMIT: Omit<EvalResult, "steps"> = {
  verdict: "PERMIT",
  layer: "none",
  reason: "Internal workflow remains inside approved boundary",
  omega: "not reached",
  runtimeStatus: "eligible for execution",
};

export function evaluateTrajectory(trajectory: ToolCall[]): EvalResult {
  const steps: StepSummary[] = trajectory.map((s, i) => ({
    index: i + 1,
    tool: s.tool,
    summary: s.tool,
  }));

  let sawDataSource = false;
  let sawCredSource = false;

  const block = (over: Omit<EvalResult, "steps" | "verdict" | "runtimeStatus">): EvalResult => ({
    verdict: "BLOCK",
    runtimeStatus: "denied before execution",
    steps,
    ...over,
  });

  for (const step of trajectory) {
    const tool = (step.tool || "").trim().toLowerCase();
    const args = (step.args && typeof step.args === "object" ? step.args : {}) as Record<string, unknown>;
    const text = argText(args);

    // ── Single-step forbidden actions (Layer V1) ──
    if (SHELL_TOOLS.test(tool) && DANGEROUS_CMD.test(text)) {
      return block({ layer: "V1", reason: "Unsafe shell command execution", omega: "arbitrary_code_execution" });
    }
    if (PATH_TRAVERSAL.test(text)) {
      return block({ layer: "V1", reason: "Path traversal outside approved boundary", omega: "path_traversal" });
    }
    if (TRANSFER_TOOLS.test(tool) && isUnauthorisedRecipient(args)) {
      return block({ layer: "V2", reason: "Funds movement to unauthorised recipient", omega: "unauthorized_transfer" });
    }

    // ── Source → external sink chains (Layer V2) ──
    if (CRED_TOOLS.test(tool) || (DATA_SOURCE_TOOLS.test(tool) && CRED_SIGNAL.test(text))) {
      sawCredSource = true;
    } else if (DATA_SOURCE_TOOLS.test(tool)) {
      sawDataSource = true;
    }

    if (isExternalSink(tool, args)) {
      if (sawCredSource) {
        return block({ layer: "V2", reason: "Credential source → external sink", omega: "credential_exfiltration" });
      }
      if (sawDataSource) {
        return block({ layer: "V2", reason: "Source → external sink", omega: "data_exfiltration" });
      }
    }
  }

  return { ...PERMIT, steps };
}
