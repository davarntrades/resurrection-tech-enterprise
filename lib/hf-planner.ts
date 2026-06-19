/**
 * Server-side Hugging Face planner — the SAME open-weight model used in the
 * Colab/script smoke test (default Qwen/Qwen2.5-0.5B-Instruct), called through
 * the Hugging Face Inference router (OpenAI-compatible chat completions).
 *
 * The token lives ONLY on the server (HF_API_TOKEN). This module returns the
 * model's raw text; parsing into a trajectory happens in lib/planner.ts. It
 * never decides a governance verdict.
 */

import {
  PLANNER_SYSTEM,
  PLANNER_EXAMPLE_USER,
  PLANNER_EXAMPLE_ASSISTANT,
} from "@/lib/planner";

const HF_ROUTER = "https://router.huggingface.co/v1/chat/completions";

export const PLANNER_MODEL = process.env.PLANNER_MODEL ?? "Qwen/Qwen2.5-0.5B-Instruct";

function hfToken(): string | undefined {
  return (
    process.env.HF_API_TOKEN ||
    process.env.HUGGINGFACE_API_KEY ||
    process.env.HUGGING_FACE_HUB_TOKEN ||
    process.env.HF_TOKEN ||
    undefined
  );
}

export function hfPlannerConfigured(): boolean {
  return Boolean(hfToken());
}

/**
 * Run the Hugging Face planner on a plain-English task and return its raw text.
 * Throws on missing token / transport / non-2xx so the caller can fall back to
 * the transparent heuristic planner (never fabricating an HF result).
 */
export async function runHuggingFacePlanner(task: string, timeoutMs = 12000): Promise<string> {
  const token = hfToken();
  if (!token) throw new Error("Hugging Face planner not configured (set HF_API_TOKEN)");

  const res = await fetch(HF_ROUTER, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      model: PLANNER_MODEL,
      messages: [
        { role: "system", content: PLANNER_SYSTEM },
        { role: "user", content: PLANNER_EXAMPLE_USER },
        { role: "assistant", content: PLANNER_EXAMPLE_ASSISTANT },
        { role: "user", content: task },
      ],
      max_tokens: 256,
      temperature: 0, // greedy → deterministic, mirrors the notebook
      stream: false,
    }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });

  if (!res.ok) {
    let detail = `HF inference ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string | { message?: string } };
      const m = typeof j.error === "string" ? j.error : j.error?.message;
      if (m) detail = m;
    } catch {
      /* keep generic */
    }
    throw new Error(detail);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content || !content.trim()) throw new Error("HF planner returned an empty completion");
  return content.trim();
}
