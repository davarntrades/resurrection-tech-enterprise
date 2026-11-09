/**
 * One evidence-status vocabulary for every surface (Lab, Control Room,
 * integration panels). It mirrors the engine and service:
 *
 *   INTEGRITY_FAILED   a check failed
 *   INTEGRITY_CHECKED  hashes recompute — a SELF-check by the writer; anyone
 *                      with write access can produce a consistent rewrite
 *   KEYED_VERIFIED     + HMAC verified with the deployment's evidence key
 *   ANCHOR_VERIFIED    + matches an exported (head, count) anchor
 *
 * Nothing here ever renders "VERIFIED" on its own, and nothing renders
 * "independently verified": that needs a party other than the writer, which
 * none of these checks establishes.
 */
export type EvidenceIntegrityLike = {
  status?: string | null;
  evidence_status?: string | null;
  evidence_verified?: boolean | null;
} | null | undefined;

export function evidenceLabel(integrity: EvidenceIntegrityLike): string {
  const status = integrity?.status || integrity?.evidence_status;
  if (status === "INTEGRITY_FAILED") return "INTEGRITY FAILED";
  if (status === "ANCHOR_VERIFIED") return "KEYED + ANCHORED (self-check)";
  if (status === "KEYED_VERIFIED") return "KEYED (self-check)";
  if (status === "INTEGRITY_CHECKED") return "INTEGRITY CHECKED (self-check, unkeyed)";
  if (status === "MIXED") return "MIXED — see records";
  if (integrity?.evidence_verified === false) return "INTEGRITY FAILED";
  if (integrity?.evidence_verified === true) return "INTEGRITY CHECKED (self-check)";
  return "RECORDED (not checked)";
}

const RANK: Record<string, number> = { PERMIT: 0, ALLOW: 0, ESCALATE: 1, BLOCK: 2 };

/** The strictest verdict across a session's steps (shadow steps use the would-be verdict). */
export function strictestStepVerdict(steps: any[] | undefined): string {
  let best = "—"; let rank = -1;
  for (const step of steps || []) {
    const v = String(step?.morrison_decision?.strictest_verdict || step?.morrison_decision?.verdict || "");
    if (!v) continue;
    const r = RANK[v] ?? 2;
    if (r > rank) { rank = r; best = v; }
  }
  return best;
}

export function operatingModeLabel(mode: string | null | undefined, kind?: string | null): string {
  const m = String(mode || "");
  const base = m === "shadow" ? "SHADOW — enforcement inactive"
    : m === "enforce" || m === "enforced" ? "ENFORCED"
    : m === "guarded_pilot" ? "GUARDED PILOT" : m ? m.replaceAll("_", " ").toUpperCase() : "—";
  return kind === "single_run" ? `${base} · single run` : kind === "boundary_scenarios" ? `${base} · boundary scenarios` : base;
}
