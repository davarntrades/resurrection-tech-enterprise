/**
 * Shareable-result codec for the "Test Without Your Own Agent" demo.
 *
 * The whole result is encoded into the URL (`?r=<base64url>`) — there is NO
 * server-side storage of any user payload, and no token is ever included. A
 * recipient (CTO / CISO / AI lead / compliance officer) just opens the link.
 */

export type ShareVerdict = "PERMIT" | "BLOCK" | "INCONCLUSIVE";

export interface ShareableResult {
  v: 1; // schema version
  task: string;
  trajectory: { tool: string; args: Record<string, unknown> }[];
  verdict: ShareVerdict;
  layer: string;
  reason: string;
  runtimeStatus: string;
  source: "morrison" | "heuristic";
  planner?: { source: string; model: string };
  humanReview?: {
    reason: string; requiredAction: string; decisionAuthority: string; nextStep: string; executionStatus: string;
  };
  origin: "sample" | "generated";
  label?: string;
  ts: number; // epoch ms
}

const REPORT_PATH = "/test-without-agent/report";

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeResult(r: ShareableResult): string {
  return toBase64Url(JSON.stringify(r));
}

export function decodeResult(s: string | null | undefined): ShareableResult | null {
  if (!s) return null;
  try {
    const o = JSON.parse(fromBase64Url(s)) as ShareableResult;
    if (o && o.v === 1 && typeof o.verdict === "string" && Array.isArray(o.trajectory)) return o;
    return null;
  } catch {
    return null;
  }
}

/** Relative report URL (works in a new tab without needing window.origin). */
export function reportPath(r: ShareableResult, opts?: { print?: boolean }): string {
  const q = `r=${encodeResult(r)}${opts?.print ? "&print=1" : ""}`;
  return `${REPORT_PATH}?${q}`;
}

/** Absolute report URL for copy-to-clipboard (browser only). */
export function reportUrl(r: ShareableResult): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${reportPath(r)}`;
}
