/** Server-only client for the Railway-hosted Frontier Containment service. */

const DEFAULT_URL = "https://resurrection-tech-enterprise-production.up.railway.app";
const TIMEOUT_MS = Math.max(10_000, Math.min(Number(process.env.FRONTIER_PROXY_TIMEOUT_MS ?? 180_000), 300_000));

export async function frontierService(path: string, init: RequestInit = {}) {
  const base = (process.env.GOVERNANCE_URL ?? DEFAULT_URL).trim().replace(/\/$/, "");
  if (!base) throw new Error("Morrison governance service is not configured");
  const token = process.env.GOVERNANCE_TOKEN ?? "";
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({ detail: `Frontier service returned HTTP ${res.status}` }));
  return { res, data };
}

export function publicFrontierError(data: any, fallback: string) {
  const detail = data?.detail;
  if (typeof detail === "string") return detail.slice(0, 500);
  if (detail && typeof detail === "object") {
    return String(detail.message || detail.error || fallback).slice(0, 500);
  }
  return fallback;
}
