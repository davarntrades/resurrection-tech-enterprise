/**
 * Server-only client for the Railway PDF renderer.
 *
 * NEVER import this from client/browser code — it carries the renderer shared
 * secret. The renderer URL + secret are read from server-only env vars
 * (RENDERER_URL / RENDERER_SECRET), so they never reach the browser bundle.
 *
 * The renderer accepts HTML documents only (never URLs) and returns PDF bytes.
 * Fails closed: throws on missing config, non-2xx, or a timeout.
 */
const RENDERER_URL = process.env.RENDERER_URL || "";
const RENDERER_SECRET = process.env.RENDERER_SECRET || "";
const TIMEOUT_MS = Number(process.env.RENDERER_TIMEOUT_MS || 45000);

export function rendererConfigured(): boolean {
  return !!(RENDERER_URL && RENDERER_SECRET);
}

export type RenderDoc = { name: string; html: string };
export type RenderedFile = { name: string; bytes: Buffer };

export async function renderPdfs(documents: RenderDoc[]): Promise<RenderedFile[]> {
  if (!rendererConfigured()) throw new Error("PDF renderer is not configured (RENDERER_URL / RENDERER_SECRET unset)");
  if (!documents.length) return [];
  const url = RENDERER_URL.replace(/\/+$/, "") + "/render";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", "x-render-secret": RENDERER_SECRET },
      body: JSON.stringify({ documents }),
    });
    if (!res.ok) {
      let msg = `renderer HTTP ${res.status}`;
      try { const j: any = await res.json(); if (j?.error) msg = String(j.error); } catch { /* non-json */ }
      throw new Error(msg);
    }
    const j: any = await res.json();
    if (!j?.ok || !Array.isArray(j.files)) throw new Error("renderer returned no files");
    return j.files.map((f: any) => ({ name: String(f.name), bytes: Buffer.from(String(f.pdf_base64 || ""), "base64") }));
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error(`renderer timed out after ${TIMEOUT_MS}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
